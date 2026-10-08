/** African countries (ISO 3166-1 alpha-2) for profile preferences and content scope. */
export const AFRICAN_COUNTRIES: { code: string; name: string }[] = [
  ['DZ', 'Algeria'], ['AO', 'Angola'], ['BJ', 'Benin'], ['BW', 'Botswana'], ['BF', 'Burkina Faso'],
  ['BI', 'Burundi'], ['CV', 'Cabo Verde'], ['CM', 'Cameroon'], ['CF', 'Central African Republic'], ['TD', 'Chad'],
  ['KM', 'Comoros'], ['CG', 'Congo'], ['CD', 'DR Congo'], ['CI', "Côte d'Ivoire"], ['DJ', 'Djibouti'],
  ['EG', 'Egypt'], ['GQ', 'Equatorial Guinea'], ['ER', 'Eritrea'], ['SZ', 'Eswatini'], ['ET', 'Ethiopia'],
  ['GA', 'Gabon'], ['GM', 'Gambia'], ['GH', 'Ghana'], ['GN', 'Guinea'], ['GW', 'Guinea-Bissau'],
  ['KE', 'Kenya'], ['LS', 'Lesotho'], ['LR', 'Liberia'], ['LY', 'Libya'], ['MG', 'Madagascar'],
  ['MW', 'Malawi'], ['ML', 'Mali'], ['MR', 'Mauritania'], ['MU', 'Mauritius'], ['MA', 'Morocco'],
  ['MZ', 'Mozambique'], ['NA', 'Namibia'], ['NE', 'Niger'], ['NG', 'Nigeria'], ['RW', 'Rwanda'],
  ['ST', 'São Tomé and Príncipe'], ['SN', 'Senegal'], ['SC', 'Seychelles'], ['SL', 'Sierra Leone'], ['SO', 'Somalia'],
  ['ZA', 'South Africa'], ['SS', 'South Sudan'], ['SD', 'Sudan'], ['TZ', 'Tanzania'], ['TG', 'Togo'],
  ['TN', 'Tunisia'], ['UG', 'Uganda'], ['ZM', 'Zambia'], ['ZW', 'Zimbabwe'],
].map(([code, name]) => ({ code, name }));

export const COUNTRY_NAMES: Record<string, string> = Object.fromEntries(AFRICAN_COUNTRIES.map((c) => [c.code, c.name]));
