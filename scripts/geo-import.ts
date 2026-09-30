/**
 * Loads GeoNames place data (CC BY 4.0) into geo_countries, geo_regions and
 * geo_cities: every country, its regions (states, provinces, governorates…)
 * and every city or town with at least 1,000 people.
 *
 *   pnpm geo:import
 *
 * Needs DATABASE_URL: the Session pooler URI from Supabase → Connect (the
 * direct connection is IPv6-only), with the password filled in. Put it in the
 * git-ignored root .env (see .env.example) or set it in the terminal. This
 * script never prints it.
 *
 * Safe to re-run: rows are upserted, and nothing is ever deleted (households
 * and profiles point at cities).
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

import { strFromU8, unzipSync } from 'fflate'
import postgres from 'postgres'

import { placeSlug } from '../packages/shared/src/geo/places'

const SOURCE = 'https://download.geonames.org/export/dump/'
const CACHE_DIR = join(import.meta.dirname, '../.cache/geonames')

/**
 * GeoNames feature codes we leave out: neighborhoods (PPLX, more precise than
 * a city, which we never want to store) and places that no longer exist.
 */
const EXCLUDED_FEATURES = new Set(['PPLX', 'PPLH', 'PPLQ', 'PPLW', 'PPLCH'])

interface Country {
  code: string
  name: string
}
interface Region {
  id: string
  country_code: string
  name: string
  slug: string
}
interface City {
  id: number
  region_id: string
  country_code: string
  name: string
  ascii_name: string
  district: string | null
  slug: string
  population: number
}

async function fetchCached(file: string): Promise<Uint8Array> {
  mkdirSync(CACHE_DIR, { recursive: true })
  const path = join(CACHE_DIR, file)
  if (existsSync(path)) return readFileSync(path)
  console.log(`Downloading ${file}…`)
  const res = await fetch(SOURCE + file)
  if (!res.ok) throw new Error(`Download failed for ${file}: HTTP ${res.status}`)
  const bytes = new Uint8Array(await res.arrayBuffer())
  writeFileSync(path, bytes)
  return bytes
}

const rowsOf = (text: string) =>
  text
    .split('\n')
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => line.replace(/\r$/, '').split('\t'))

/**
 * Gives each item a slug unique within its group. Items arrive most important
 * first, so the biggest place keeps the plain slug; later ones try each
 * qualifier in turn ("springfield-sangamon"). The last qualifier must be
 * globally unique (an id), so every item ends up with a free slug.
 */
function assignUniqueSlugs<T extends { slug: string }>(
  items: T[],
  groupOf: (item: T) => string,
  qualifiersOf: (item: T) => string[],
) {
  const taken = new Set<string>()
  for (const item of items) {
    const group = groupOf(item)
    const candidates = [
      item.slug,
      ...qualifiersOf(item).map((q) => (item.slug ? `${item.slug}-${q}` : q)),
    ].filter(Boolean)
    const slug = candidates.find((c) => !taken.has(`${group}/${c}`)) ?? candidates.at(-1)!
    item.slug = slug
    taken.add(`${group}/${slug}`)
  }
}

async function loadSource() {
  const countries: Country[] = rowsOf(strFromU8(await fetchCached('countryInfo.txt')))
    .filter((c) => /^[A-Z]{2}$/.test(c[0] ?? ''))
    .map((c) => ({ code: c[0]!, name: c[4]! }))
  const countryNames = new Map(countries.map((c) => [c.code, c.name]))

  const regions: Region[] = rowsOf(strFromU8(await fetchCached('admin1CodesASCII.txt')))
    .map((r) => ({
      id: r[0]!,
      country_code: r[0]!.slice(0, 2),
      name: r[1]!,
      slug: placeSlug(r[2] || r[1]!),
    }))
    .filter((r) => countryNames.has(r.country_code))
  const regionIds = new Set(regions.map((r) => r.id))

  const districts = new Map(
    rowsOf(strFromU8(await fetchCached('admin2Codes.txt'))).map((d) => [d[0]!, d[1]!]),
  )

  const zip = unzipSync(await fetchCached('cities1000.zip'))
  const citiesText = zip['cities1000.txt']
  if (!citiesText) throw new Error('cities1000.zip did not contain cities1000.txt')

  const cities: City[] = []
  let skipped = 0
  for (const c of rowsOf(strFromU8(citiesText))) {
    const countryCode = c[8] ?? ''
    if (!countryNames.has(countryCode) || EXCLUDED_FEATURES.has(c[7] ?? '')) {
      skipped++
      continue
    }
    let regionId = `${countryCode}.${c[10] ?? ''}`
    if (!regionIds.has(regionId)) {
      // No usable region: file it under a catch-all region named after the country.
      regionId = `${countryCode}.00`
      if (!regionIds.has(regionId)) {
        const name = countryNames.get(countryCode)!
        regions.push({ id: regionId, country_code: countryCode, name, slug: placeSlug(name) })
        regionIds.add(regionId)
      }
    }
    cities.push({
      id: Number(c[0]),
      region_id: regionId,
      country_code: countryCode,
      name: c[1]!,
      ascii_name: c[2] || c[1]!,
      district: districts.get(`${countryCode}.${c[10] ?? ''}.${c[11] ?? ''}`) ?? null,
      slug: placeSlug(c[2] || c[1]!),
      population: Number(c[14]) || 0,
    })
  }

  // Biggest places keep the plain slug; rare same-name duplicates get the id appended.
  assignUniqueSlugs(
    regions,
    (r) => r.country_code,
    (r) => [placeSlug(r.id.split('.')[1] ?? '') || 'x'],
  )
  cities.sort((a, b) => b.population - a.population || a.id - b.id)
  assignUniqueSlugs(
    cities,
    (c) => c.region_id,
    (c) => [placeSlug(c.district ?? ''), String(c.id)].filter(Boolean),
  )

  return { countries, regions, cities, skipped }
}

async function main() {
  const envFile = join(import.meta.dirname, '../.env')
  if (existsSync(envFile)) process.loadEnvFile(envFile)
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error(
      'Set DATABASE_URL (Supabase → Connect → Session pooler URI) in the root .env.\n' +
        'See .env.example.',
    )
    process.exit(1)
  }
  const isLocal = /@(127\.0\.0\.1|localhost)[:/]/.test(url)
  const { countries, regions, cities, skipped } = await loadSource()

  console.log(
    `Loading ${countries.length} countries, ${regions.length} regions and ${cities.length} cities ` +
      `(${skipped} neighborhoods/historical places skipped) into ${isLocal ? 'the local database' : 'the database from DATABASE_URL'}…`,
  )

  const sql = postgres(url, { ssl: isLocal ? false : 'require', max: 1, onnotice: () => {} })
  try {
    await sql.begin(async (tx) => {
      await tx`
        insert into public.geo_countries ${tx(countries, 'code', 'name')}
        on conflict (code) do update set name = excluded.name`
      for (let i = 0; i < regions.length; i += 2000) {
        const batch = regions.slice(i, i + 2000)
        await tx`
          insert into public.geo_regions ${tx(batch, 'id', 'country_code', 'name', 'slug')}
          on conflict (id) do update set name = excluded.name, slug = excluded.slug`
      }
      for (let i = 0; i < cities.length; i += 5000) {
        const batch = cities.slice(i, i + 5000)
        await tx`
          insert into public.geo_cities ${tx(batch, 'id', 'region_id', 'country_code', 'name', 'ascii_name', 'district', 'slug', 'population')}
          on conflict (id) do update set
            region_id = excluded.region_id, country_code = excluded.country_code,
            name = excluded.name, ascii_name = excluded.ascii_name, district = excluded.district,
            slug = excluded.slug, population = excluded.population`
      }
    })
    console.log('Done. Show "Place data © GeoNames (CC BY 4.0)" wherever places appear.')
  } finally {
    await sql.end()
  }
}

main().catch((error: unknown) => {
  // Report the problem without echoing connection details.
  const message = error instanceof Error ? error.message : String(error)
  console.error(
    `\nPlace import failed: ${message.replace(/postgres(ql)?:\/\/\S+/g, '[database url]')}`,
  )
  process.exit(1)
})
