import { placeSearchText } from '@households/shared'
import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { supabase } from '../../lib/supabase'

// Places are public reference data (GeoNames), readable before sign-in.

export interface CountryOption {
  code: string
  name: string
}

export interface RegionOption {
  id: string
  name: string
  slug: string
}

export interface CityOption {
  id: number
  name: string
  slug: string
  district: string | null
}

export function useCountries() {
  return useQuery({
    queryKey: ['places', 'countries'],
    staleTime: Infinity,
    queryFn: async (): Promise<CountryOption[]> => {
      const { data, error } = await supabase
        .from('geo_countries')
        .select('code, name')
        .order('name')
      if (error) throw error
      return data
    },
  })
}

export function useRegions(countryCode: string) {
  return useQuery({
    queryKey: ['places', 'regions', countryCode],
    enabled: countryCode.length === 2,
    staleTime: Infinity,
    queryFn: async (): Promise<RegionOption[]> => {
      const { data, error } = await supabase
        .from('geo_regions')
        .select('id, name, slug')
        .eq('country_code', countryCode)
        .order('name')
      if (error) throw error
      return data
    },
  })
}

/** Cities in a region whose name starts with what was typed, biggest first. */
export function useCitySearch(regionId: string, query: string) {
  const text = placeSearchText(query)
  return useQuery({
    queryKey: ['places', 'cities', regionId, text.toLowerCase()],
    enabled: regionId.length > 0 && text.length > 0,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<CityOption[]> => {
      // placeSearchText already strips LIKE wildcards; escape defensively anyway.
      const pattern = `${text.replace(/[%_\\]/g, '\\$&')}%`
      const { data, error } = await supabase
        .from('geo_cities')
        .select('id, name, slug, district')
        .eq('region_id', regionId)
        .ilike('ascii_name', pattern)
        .order('population', { ascending: false })
        .limit(20)
      if (error) throw error
      return data
    },
  })
}
