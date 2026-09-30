import { GEONAMES_ATTRIBUTION } from '@households/shared'
import { useState } from 'react'

import { Combobox, Muted, Select, Stack } from '../../components/ui'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import type { LocationValue } from './location'
import { useCitySearch, useCountries, useRegions } from './queries'

interface LocationPickerProps {
  value: LocationValue
  onChange: (value: LocationValue) => void
  errors?: { country?: string | undefined; city?: string | undefined }
  /** Explains why we ask, shown under the city. */
  hint?: string
}

/**
 * Country → state/region → city. Cities are searched as you type, because
 * even one region can have thousands.
 */
export function LocationPicker({ value, onChange, errors, hint }: LocationPickerProps) {
  const countries = useCountries()
  const regions = useRegions(value.countryCode)
  const [cityInput, setCityInput] = useState(value.city?.name ?? '')
  const debounced = useDebouncedValue(cityInput)
  const cities = useCitySearch(value.regionId, value.city ? '' : debounced)

  return (
    <Stack $gap={4}>
      <Select
        label="Country"
        placeholder={countries.isPending ? 'Loading…' : 'Choose a country'}
        value={value.countryCode}
        autoComplete="country"
        onChange={(e) => {
          onChange({ countryCode: e.target.value, regionId: '', regionSlug: '', city: null })
          setCityInput('')
        }}
        error={errors?.country}
      >
        {countries.data?.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name}
          </option>
        ))}
      </Select>

      <Select
        label="State or region"
        placeholder={value.countryCode ? 'Choose a state or region' : 'Choose a country first'}
        value={value.regionId}
        disabled={!value.countryCode || regions.isPending}
        onChange={(e) => {
          const region = regions.data?.find((r) => r.id === e.target.value)
          onChange({
            ...value,
            regionId: e.target.value,
            regionSlug: region?.slug ?? '',
            city: null,
          })
          setCityInput('')
        }}
      >
        {regions.data?.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </Select>

      <Combobox
        label="City or town"
        placeholder={value.regionId ? 'Start typing your city' : 'Choose a state or region first'}
        disabled={!value.regionId}
        selected={value.city !== null}
        inputValue={cityInput}
        onInputChange={(text) => {
          setCityInput(text)
          if (value.city) onChange({ ...value, city: null })
        }}
        options={cities.data ?? []}
        getKey={(c) => c.id}
        getLabel={(c) => c.name}
        getDescription={(c) => c.district}
        onSelect={(city) => {
          onChange({ ...value, city })
          setCityInput(city.name)
        }}
        loading={cities.isFetching}
        emptyText="No city found. Try a nearby town."
        error={errors?.city}
        hint={hint}
      />

      <Muted as="span">{GEONAMES_ATTRIBUTION}</Muted>
    </Stack>
  )
}
