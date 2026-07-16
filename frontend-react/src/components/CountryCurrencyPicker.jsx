// src/components/CountryCurrencyPicker.jsx
import { useState, useMemo, Fragment } from 'react';
import { Combobox, Listbox, Transition } from '@headlessui/react';
import { useTranslation } from 'react-i18next';
import { COUNTRIES, getCountryByCode, getCountryFlag } from '../data/countries';
import { CURRENCY_FLAGS } from '../utils/currencyHelpers';

/**
 * Combined country + currency picker for ProfilePage.
 *
 * Props:
 *   country       : current ISO 3166 code (e.g., "ID") or null
 *   currency      : current ISO 4217 code (e.g., "IDR")
 *   supportedCurrencies : array of available currency codes from /fx/supported
 *   onCountryChange     : (code: string | null) => void
 *   onCurrencyChange    : (code: string) => void
 *   disabled            : boolean
 */
export default function CountryCurrencyPicker({
  country,
  currency,
  supportedCurrencies = [],
  onCountryChange,
  onCurrencyChange,
  disabled = false,
}) {
  const { t } = useTranslation();
  const [countryQuery, setCountryQuery] = useState('');
  const [currencyQuery, setCurrencyQuery] = useState('');

  // ─── Country: filtered list based on search query ───
  const filteredCountries = useMemo(() => {
    if (!countryQuery) return COUNTRIES;
    const q = countryQuery.toLowerCase().trim();
    return COUNTRIES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().startsWith(q)
    );
  }, [countryQuery]);

  const selectedCountry = useMemo(() => getCountryByCode(country), [country]);

  // ─── Currency: filtered list + sorted with popular ones first ───
  const POPULAR_FIRST = ['USD', 'EUR', 'GBP', 'JPY', 'CNY', 'IDR', 'TWD', 'KRW', 'INR', 'SGD'];

  const sortedCurrencies = useMemo(() => {
    if (!supportedCurrencies.length) return [];
    const popular = POPULAR_FIRST.filter((c) => supportedCurrencies.includes(c));
    const rest = supportedCurrencies.filter((c) => !POPULAR_FIRST.includes(c)).sort();
    return [...popular, ...rest];
  }, [supportedCurrencies]);

  const filteredCurrencies = useMemo(() => {
    if (!currencyQuery) return sortedCurrencies;
    const q = currencyQuery.toLowerCase().trim();
    return sortedCurrencies.filter((c) => c.toLowerCase().includes(q));
  }, [sortedCurrencies, currencyQuery]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {/* ═══════════════════════════════════════════════════════ */}
      {/* COUNTRY COMBOBOX (with search)                          */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div>
        <label className="block text-xs font-semibold text-text-muted/70 uppercase tracking-wider mb-2">
          {t('profile.country', 'Country')}
        </label>

        <Combobox
          value={selectedCountry}
          onChange={(c) => onCountryChange?.(c?.code || null)}
          disabled={disabled}
        >
          <div className="relative">
            <div
              className="relative w-full rounded-xl overflow-hidden"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              {/* Flag prefix */}
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-lg pointer-events-none">
                {selectedCountry?.flag || '🌐'}
              </span>

              <Combobox.Input
                className="w-full pl-12 pr-10 py-3 bg-transparent text-sm text-text-primary placeholder:text-text-muted/40 focus:outline-none"
                displayValue={(c) => c?.name || ''}
                placeholder={t('profile.country_placeholder', 'Search country...')}
                onChange={(e) => setCountryQuery(e.target.value)}
              />

              <Combobox.Button className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-text-muted/60 hover:text-gold-primary transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </Combobox.Button>
            </div>

            <Transition
              as={Fragment}
              leave="transition ease-in duration-100"
              leaveFrom="opacity-100"
              leaveTo="opacity-0"
              afterLeave={() => setCountryQuery('')}
            >
              <Combobox.Options
                className="absolute z-[10000] mt-2 max-h-72 w-full overflow-auto rounded-xl py-1.5 text-sm shadow-2xl focus:outline-none"
                style={{
                  background: 'rgb(var(--surface-secondary))',
                  border: '1px solid rgba(212,168,83,0.25)',
                  boxShadow: '0 25px 50px rgba(0,0,0,0.6), 0 0 30px rgba(212,168,83,0.05)',
                }}
              >
                {/* Clear option */}
                {country && (
                  <Combobox.Option
                    value={null}
                    className={({ active }) =>
                      `relative cursor-pointer select-none py-2.5 pl-12 pr-4 transition-colors ${
                        active ? 'bg-red-500/10 text-red-400' : 'text-text-muted/60'
                      }`
                    }
                  >
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-base">✕</span>
                    <span className="text-[13px] italic">
                      {t('profile.clear_country', 'Clear country selection')}
                    </span>
                  </Combobox.Option>
                )}

                {filteredCountries.length === 0 && countryQuery !== '' ? (
                  <div className="cursor-default select-none py-4 px-4 text-center text-text-muted/60 text-xs">
                    {t('profile.no_country_match', 'No country matches')} "{countryQuery}"
                  </div>
                ) : (
                  filteredCountries.map((c) => (
                    <Combobox.Option
                      key={c.code}
                      value={c}
                      className={({ active, selected }) =>
                        `relative cursor-pointer select-none py-2.5 pl-12 pr-4 transition-colors ${
                          active ? 'bg-gold-primary/10 text-text-primary' : 'text-text-secondary'
                        } ${selected ? 'text-gold-primary' : ''}`
                      }
                    >
                      {({ selected }) => (
                        <>
                          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-lg">{c.flag}</span>
                          <span className={`block truncate text-[13px] ${selected ? 'font-semibold' : 'font-normal'}`}>
                            {c.name}
                          </span>
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-text-muted/40">
                            {c.code}
                          </span>
                        </>
                      )}
                    </Combobox.Option>
                  ))
                )}
              </Combobox.Options>
            </Transition>
          </div>
        </Combobox>

        <p className="text-text-muted/40 text-[11px] mt-1.5">
          {t('profile.country_hint', 'Used to auto-select your currency')}
        </p>
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* CURRENCY LISTBOX (with search)                          */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div>
        <label className="block text-xs font-semibold text-text-muted/70 uppercase tracking-wider mb-2">
          {t('profile.currency', 'Display Currency')}
        </label>

        <Combobox
          value={currency}
          onChange={(code) => onCurrencyChange?.(code)}
          disabled={disabled}
        >
          <div className="relative">
            <div
              className="relative w-full rounded-xl overflow-hidden"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(212,168,83,0.15)',
              }}
            >
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-lg pointer-events-none">
                {CURRENCY_FLAGS[currency] || '💱'}
              </span>

              <Combobox.Input
                className="w-full pl-12 pr-10 py-3 bg-transparent text-sm text-text-primary font-mono focus:outline-none"
                displayValue={(code) => code || ''}
                placeholder={t('profile.currency_placeholder', 'Search currency...')}
                onChange={(e) => setCurrencyQuery(e.target.value)}
              />

              <Combobox.Button className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-text-muted/60 hover:text-gold-primary transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </Combobox.Button>
            </div>

            <Transition
              as={Fragment}
              leave="transition ease-in duration-100"
              leaveFrom="opacity-100"
              leaveTo="opacity-0"
              afterLeave={() => setCurrencyQuery('')}
            >
              <Combobox.Options
                className="absolute z-[10000] mt-2 max-h-72 w-full overflow-auto rounded-xl py-1.5 text-sm shadow-2xl focus:outline-none"
                style={{
                  background: 'rgb(var(--surface-secondary))',
                  border: '1px solid rgba(212,168,83,0.25)',
                  boxShadow: '0 25px 50px rgba(0,0,0,0.6), 0 0 30px rgba(212,168,83,0.05)',
                }}
              >
                {filteredCurrencies.length === 0 ? (
                  <div className="cursor-default select-none py-4 px-4 text-center text-text-muted/60 text-xs">
                    {t('profile.no_currency_match', 'No currency matches')} "{currencyQuery}"
                  </div>
                ) : (
                  filteredCurrencies.map((code, idx) => {
                    const isPopular = idx < 10 && !currencyQuery;
                    const showDivider = idx === 10 && !currencyQuery;
                    return (
                      <Fragment key={code}>
                        {showDivider && (
                          <div className="my-1 mx-3 border-t border-white/[0.04]" />
                        )}
                        <Combobox.Option
                          value={code}
                          className={({ active, selected }) =>
                            `relative cursor-pointer select-none py-2.5 pl-12 pr-4 transition-colors ${
                              active ? 'bg-gold-primary/10 text-text-primary' : 'text-text-secondary'
                            } ${selected ? 'text-gold-primary' : ''}`
                          }
                        >
                          {({ selected }) => (
                            <>
                              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-lg">
                                {CURRENCY_FLAGS[code] || '💱'}
                              </span>
                              <span className={`block truncate font-mono text-[13px] ${selected ? 'font-bold' : ''}`}>
                                {code}
                              </span>
                              {isPopular && (
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-mono uppercase tracking-wider text-gold-primary/50">
                                  Popular
                                </span>
                              )}
                            </>
                          )}
                        </Combobox.Option>
                      </Fragment>
                    );
                  })
                )}
              </Combobox.Options>
            </Transition>
          </div>
        </Combobox>

        <p className="text-text-muted/40 text-[11px] mt-1.5">
          {t('profile.currency_hint', 'Override auto-selection if needed')}
        </p>
      </div>
    </div>
  );
}