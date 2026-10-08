import 'server-only';
import type { QuestionInput } from '@/lib/shared/question-input';

/**
 * DEVELOPMENT FIXTURES — NOT VERIFIED PRODUCTION CONTENT.
 *
 * These questions exist so the game can be exercised end to end in local
 * development and automated tests. They were written for testing, have not
 * been through Fastora's editorial verification, and are flagged `is_fixture`
 * in the database. Production launch requires the verified question bank
 * (see docs/CONTENT_GUIDE.md). Never seed these into production.
 */

type F = [category: string, difficulty: 'easy' | 'medium' | 'hard', text: string, options: [string, string, string, string], explanation: string, scope: string[], wiki: string];

// The first option is the correct one; options are shuffled when issued.
const RAW: F[] = [
  // ---------------------------------------------------------------- easy
  ['geography', 'easy', 'Which is the longest river in Africa?', ['The Nile', 'The Congo', 'The Niger', 'The Zambezi'], 'The Nile flows north for roughly 6,650 km before reaching the Mediterranean Sea in Egypt.', ['AFRICA'], 'Nile'],
  ['geography', 'easy', 'What is the capital city of Kenya?', ['Nairobi', 'Mombasa', 'Kisumu', 'Nakuru'], 'Nairobi is Kenya’s capital and largest city; Mombasa is its main port.', ['KE'], 'Nairobi'],
  ['geography', 'easy', 'Mount Kilimanjaro is located in which country?', ['Tanzania', 'Kenya', 'Uganda', 'Ethiopia'], 'Kilimanjaro, Africa’s highest mountain, stands in north-eastern Tanzania near the Kenyan border.', ['TZ'], 'Mount_Kilimanjaro'],
  ['geography', 'easy', 'Which desert covers much of North Africa?', ['The Sahara', 'The Kalahari', 'The Namib', 'The Karoo'], 'The Sahara is the largest hot desert in the world and spans much of North Africa.', ['NORTH'], 'Sahara'],
  ['geography', 'easy', 'Which ocean lies along Africa’s eastern coast?', ['The Indian Ocean', 'The Atlantic Ocean', 'The Pacific Ocean', 'The Arctic Ocean'], 'The Indian Ocean washes Africa’s east coast, from Somalia down to South Africa.', ['EAST'], 'Indian_Ocean'],
  ['history', 'easy', 'In which year did Nelson Mandela become President of South Africa?', ['1994', '1990', '1989', '2000'], 'Mandela was inaugurated in May 1994 after South Africa’s first fully democratic elections.', ['ZA'], 'Nelson_Mandela'],
  ['history', 'easy', 'In 1957, which country became independent under the leadership of Kwame Nkrumah?', ['Ghana', 'Nigeria', 'Kenya', 'Senegal'], 'The Gold Coast became independent Ghana on 6 March 1957, with Kwame Nkrumah as its leader.', ['GH'], 'Kwame_Nkrumah'],
  ['history', 'easy', 'The ancient pyramids of Giza are in which country?', ['Egypt', 'Sudan', 'Libya', 'Morocco'], 'The Giza pyramid complex stands on the outskirts of Cairo, Egypt.', ['EG'], 'Giza_pyramid_complex'],
  ['culture', 'easy', 'Jollof rice is a celebrated dish from which region of Africa?', ['West Africa', 'North Africa', 'Southern Africa', 'The Horn of Africa'], 'Jollof rice is cooked across West Africa, and friendly rivalry over the best version is part of its fame.', ['WEST'], 'Jollof_rice'],
  ['culture', 'easy', 'Kente cloth is most closely associated with which country?', ['Ghana', 'Morocco', 'Ethiopia', 'Zambia'], 'Kente is a woven cloth of the Asante and Ewe peoples of Ghana.', ['GH'], 'Kente_cloth'],
  ['culture', 'easy', 'Couscous is a staple food in which region?', ['The Maghreb (North-West Africa)', 'The Great Lakes', 'Southern Africa', 'The Sahel only'], 'Couscous is a staple across the Maghreb — Morocco, Algeria, Tunisia and Libya.', ['NORTH'], 'Couscous'],
  ['languages', 'easy', 'Kiswahili is most widely spoken in which part of Africa?', ['East Africa', 'West Africa', 'North Africa', 'Southern Africa only'], 'Kiswahili is a lingua franca of East Africa, spoken in Tanzania, Kenya, Uganda and beyond.', ['EAST'], 'Swahili_language'],
  ['languages', 'easy', 'Amharic is the working language of which country’s federal government?', ['Ethiopia', 'Somalia', 'Sudan', 'Kenya'], 'Amharic is the working language of Ethiopia’s federal government.', ['ET'], 'Amharic'],
  ['languages', 'easy', 'Yoruba is mainly spoken in which country?', ['Nigeria', 'Kenya', 'Egypt', 'Angola'], 'Yoruba is spoken mainly in south-western Nigeria, and also in Benin and Togo.', ['NG'], 'Yoruba_language'],
  ['arts', 'easy', 'Which Nigerian author wrote the novel “Things Fall Apart”?', ['Chinua Achebe', 'Wole Soyinka', 'Chimamanda Ngozi Adichie', 'Ben Okri'], 'Chinua Achebe published “Things Fall Apart” in 1958; it is one of the most widely read African novels.', ['NG'], 'Things_Fall_Apart'],
  ['arts', 'easy', 'The music genre Afrobeat was pioneered by which musician?', ['Fela Kuti', 'Youssou N’Dour', 'Hugh Masekela', 'Miriam Makeba'], 'Fela Anikulapo Kuti blended highlife, jazz and funk into Afrobeat in Nigeria in the late 1960s and 1970s.', ['NG'], 'Fela_Kuti'],
  ['sports', 'easy', 'Which country hosted the 2010 FIFA World Cup?', ['South Africa', 'Nigeria', 'Egypt', 'Morocco'], 'South Africa hosted the 2010 FIFA World Cup, the first held on African soil.', ['ZA'], '2010_FIFA_World_Cup'],
  ['sports', 'easy', 'Which national football team is nicknamed the “Super Eagles”?', ['Nigeria', 'Ghana', 'Cameroon', 'Senegal'], 'Nigeria are the Super Eagles; Ghana are the Black Stars and Cameroon the Indomitable Lions.', ['NG'], 'Nigeria_national_football_team'],
  ['sports', 'easy', 'The highland town of Iten is famous for training long-distance runners from which country?', ['Kenya', 'Egypt', 'Nigeria', 'Angola'], 'Iten, in Kenya’s Rift Valley, is known as the “Home of Champions” for its runners.', ['KE'], 'Iten'],
  ['science', 'easy', 'Which is the largest living land animal, found in Africa?', ['The African elephant', 'The giraffe', 'The hippopotamus', 'The white rhinoceros'], 'The African bush elephant is the largest living land animal.', ['AFRICA'], 'African_elephant'],
  ['science', 'easy', 'The baobab tree is well known for storing what in its trunk?', ['Water', 'Salt', 'Oil', 'Sand'], 'Baobabs store large amounts of water in their swollen trunks to survive dry seasons.', ['AFRICA'], 'Adansonia'],
  ['society', 'easy', 'The African Union’s headquarters is in which city?', ['Addis Ababa', 'Nairobi', 'Johannesburg', 'Abuja'], 'The African Union is headquartered in Addis Ababa, Ethiopia.', ['ET'], 'African_Union'],
  ['society', 'easy', 'What is the currency of Nigeria?', ['The naira', 'The cedi', 'The rand', 'The shilling'], 'Nigeria’s currency is the naira; the cedi is Ghana’s and the rand is South Africa’s.', ['NG'], 'Nigerian_naira'],
  ['innovation', 'easy', 'The mobile money service M-Pesa launched in 2007 in which country?', ['Kenya', 'Ghana', 'Nigeria', 'Rwanda'], 'M-Pesa was launched by Safaricom in Kenya in 2007 and transformed mobile payments.', ['KE'], 'M-Pesa'],
  // -------------------------------------------------------------- medium
  ['history', 'medium', 'Who was the first President of Kenya?', ['Jomo Kenyatta', 'Daniel arap Moi', 'Mwai Kibaki', 'Tom Mboya'], 'Jomo Kenyatta led Kenya at independence and became its first president in 1964.', ['KE'], 'Jomo_Kenyatta'],
  ['history', 'medium', 'The ancient Kingdom of Aksum was centred in which present-day area?', ['Northern Ethiopia and Eritrea', 'Mali', 'Zimbabwe', 'Morocco'], 'Aksum was a major trading kingdom of the first millennium CE in today’s northern Ethiopia and Eritrea.', ['ET', 'ER'], 'Kingdom_of_Aksum'],
  ['history', 'medium', 'Great Zimbabwe is famous for walls built in what way?', ['Granite blocks fitted without mortar', 'Sun-dried mud bricks', 'Timber frames', 'Fired clay tiles'], 'Great Zimbabwe’s walls were built from granite blocks laid without mortar.', ['ZW'], 'Great_Zimbabwe'],
  ['history', 'medium', 'Mansa Musa, famous for his pilgrimage to Mecca, ruled which empire?', ['The Mali Empire', 'The Songhai Empire', 'The Ghana Empire', 'The Kanem-Bornu Empire'], 'Mansa Musa ruled the Mali Empire in the 14th century; his 1324 pilgrimage became legendary.', ['ML'], 'Mansa_Musa'],
  ['geography', 'medium', 'Lake Victoria is shared by Uganda, Kenya and which other country?', ['Tanzania', 'Rwanda', 'Burundi', 'DR Congo'], 'Lake Victoria is shared by Tanzania, Uganda and Kenya.', ['EAST'], 'Lake_Victoria'],
  ['geography', 'medium', 'What is the capital of Burkina Faso?', ['Ouagadougou', 'Bamako', 'Niamey', 'Bobo-Dioulasso'], 'Ouagadougou is Burkina Faso’s capital; Bamako and Niamey are the capitals of Mali and Niger.', ['BF'], 'Ouagadougou'],
  ['geography', 'medium', 'Victoria Falls lies on the border between Zambia and which country?', ['Zimbabwe', 'Botswana', 'Mozambique', 'Malawi'], 'Victoria Falls, on the Zambezi River, lies on the Zambia–Zimbabwe border.', ['ZM', 'ZW'], 'Victoria_Falls'],
  ['geography', 'medium', 'Which is the largest country in Africa by area?', ['Algeria', 'DR Congo', 'Sudan', 'Libya'], 'Algeria has been Africa’s largest country by area since South Sudan separated from Sudan in 2011.', ['DZ'], 'Algeria'],
  ['culture', 'medium', 'The Maasai people live mainly in which two countries?', ['Kenya and Tanzania', 'Nigeria and Cameroon', 'Ghana and Togo', 'Zambia and Malawi'], 'The Maasai live mainly in southern Kenya and northern Tanzania.', ['KE', 'TZ'], 'Maasai_people'],
  ['culture', 'medium', 'Injera, the spongy flatbread of Ethiopia and Eritrea, is traditionally made from which grain?', ['Teff', 'Cassava', 'Rice', 'Plantain'], 'Injera is traditionally made from teff, a tiny grain native to the Ethiopian highlands.', ['ET', 'ER'], 'Injera'],
  ['culture', 'medium', 'Durbar festivals with grand horse processions are especially associated with which region?', ['Northern Nigeria', 'Coastal Kenya', 'The Cape of South Africa', 'Madagascar'], 'Durbar festivals, held in cities such as Kano and Katsina, feature elaborate cavalry processions.', ['NG'], 'Durbar_festival'],
  ['languages', 'medium', 'Tifinagh is a script used to write which languages?', ['Amazigh (Berber) languages', 'Amharic and Tigrinya', 'Kiswahili', 'Hausa'], 'Tifinagh is used to write Amazigh languages and is official in Morocco alongside Arabic script.', ['NORTH'], 'Tifinagh'],
  ['languages', 'medium', 'Amharic is written in which script?', ['Ge’ez (Ethiopic)', 'Latin', 'Arabic', 'Tifinagh'], 'Amharic uses the Ge’ez (Ethiopic) script, an abugida in which each character is a syllable.', ['ET'], 'Ge%CA%BDez_script'],
  ['arts', 'medium', 'In which year did Wole Soyinka win the Nobel Prize in Literature?', ['1986', '1976', '1991', '2003'], 'Wole Soyinka became the first African laureate in Literature in 1986.', ['NG'], 'Wole_Soyinka'],
  ['arts', 'medium', 'The South African singer Miriam Makeba was popularly known as what?', ['Mama Africa', 'The Golden Voice', 'Lady of Soul', 'Queen of Highlife'], 'Miriam Makeba was known worldwide as “Mama Africa”.', ['ZA'], 'Miriam_Makeba'],
  ['arts', 'medium', 'The Egyptian singer Umm Kulthum was celebrated by what title?', ['The Star of the East', 'The Voice of the Nile', 'Mama Africa', 'The Desert Rose'], 'Umm Kulthum was called Kawkab al-Sharq — “the Star of the East”.', ['EG'], 'Umm_Kulthum'],
  ['sports', 'medium', 'In 2022, which became the first African team to reach a FIFA World Cup semi-final?', ['Morocco', 'Cameroon', 'Senegal', 'Ghana'], 'Morocco reached the semi-finals at the 2022 World Cup in Qatar.', ['MA'], 'Morocco_national_football_team'],
  ['sports', 'medium', 'Long-distance great Haile Gebrselassie represented which country?', ['Ethiopia', 'Kenya', 'Eritrea', 'Uganda'], 'Haile Gebrselassie won Olympic 10,000 m gold for Ethiopia in 1996 and 2000.', ['ET'], 'Haile_Gebrselassie'],
  ['science', 'medium', 'Which surgeon performed the first human-to-human heart transplant, in Cape Town in 1967?', ['Christiaan Barnard', 'Denton Cooley', 'Norman Shumway', 'Magdi Yacoub'], 'Christiaan Barnard led the team at Groote Schuur Hospital, Cape Town, in December 1967.', ['ZA'], 'Christiaan_Barnard'],
  ['science', 'medium', 'Lake Tanganyika is notable as the world’s…?', ['Second-deepest freshwater lake', 'Largest salt lake', 'Highest navigable lake', 'Shallowest large lake'], 'Lake Tanganyika is the second-deepest freshwater lake in the world, after Lake Baikal.', ['TZ', 'CD', 'BI', 'ZM'], 'Lake_Tanganyika'],
  ['science', 'medium', 'Nobel Peace laureate Wangari Maathai founded which organisation?', ['The Green Belt Movement', 'The Africa Climate Network', 'The Sahel Seed Bank', 'The Rainforest Alliance'], 'Wangari Maathai founded the Green Belt Movement in Kenya in 1977 and won the Nobel Peace Prize in 2004.', ['KE'], 'Wangari_Maathai'],
  ['society', 'medium', 'Kigali is the capital of which country?', ['Rwanda', 'Burundi', 'Uganda', 'Malawi'], 'Kigali is Rwanda’s capital; Burundi’s capital is Gitega.', ['RW'], 'Kigali'],
  ['society', 'medium', 'What does ECOWAS stand for?', ['Economic Community of West African States', 'East and Central Organisation of Western African Societies', 'Economic Council of West Atlantic States', 'Equatorial Commission of West African Shipping'], 'ECOWAS, founded in 1975, is the Economic Community of West African States.', ['WEST'], 'Economic_Community_of_West_African_States'],
  ['innovation', 'medium', 'From 2016, Rwanda partnered with which company to deliver blood to hospitals by drone?', ['Zipline', 'Wing', 'Matternet', 'DJI'], 'Zipline began national drone delivery of blood in Rwanda in 2016.', ['RW'], 'Zipline_(drone_delivery)'],
  // ---------------------------------------------------------------- hard
  ['history', 'hard', 'At the Battle of Adwa in 1896, Ethiopian forces defeated the army of which country?', ['Italy', 'Britain', 'France', 'Portugal'], 'Ethiopia’s victory over Italy at Adwa secured its independence and became a symbol of resistance.', ['ET'], 'Battle_of_Adwa'],
  ['history', 'hard', 'Which Queen Mother of Ejisu led the 1900 War of the Golden Stool against British forces?', ['Yaa Asantewaa', 'Nzinga Mbande', 'Amina of Zazzau', 'Makeda'], 'Yaa Asantewaa led the Asante resistance in the 1900 War of the Golden Stool.', ['GH'], 'Yaa_Asantewaa'],
  ['history', 'hard', 'Queen Nzinga ruled the kingdoms of Ndongo and Matamba in which present-day country?', ['Angola', 'Mozambique', 'Namibia', 'Gabon'], 'Nzinga Mbande ruled in what is now Angola in the 17th century and resisted Portuguese expansion.', ['AO'], 'Nzinga_of_Ndongo_and_Matamba'],
  ['history', 'hard', 'The historic Sankore Mosque, a centre of learning, is in which city?', ['Timbuktu', 'Djenné', 'Gao', 'Kano'], 'Sankore Mosque in Timbuktu was part of a renowned centre of Islamic scholarship.', ['ML'], 'Sankore_Madrasah'],
  ['history', 'hard', 'In which year did Liberia declare its independence?', ['1847', '1822', '1957', '1910'], 'Liberia declared independence on 26 July 1847.', ['LR'], 'Liberia'],
  ['geography', 'hard', 'What is the administrative capital of Eswatini?', ['Mbabane', 'Lobamba', 'Manzini', 'Maseru'], 'Mbabane is the administrative capital; Lobamba is the royal and legislative capital. Maseru is Lesotho’s capital.', ['SZ'], 'Mbabane'],
  ['geography', 'hard', 'Which country is entirely surrounded by South Africa?', ['Lesotho', 'Eswatini', 'Botswana', 'Malawi'], 'Lesotho is an enclave within South Africa; Eswatini also borders Mozambique.', ['LS'], 'Lesotho'],
  ['geography', 'hard', 'The Rwenzori Mountains lie along the border of Uganda and which country?', ['DR Congo', 'Rwanda', 'Kenya', 'South Sudan'], 'The Rwenzori range lies on the Uganda–DR Congo border.', ['UG', 'CD'], 'Rwenzori_Mountains'],
  ['geography', 'hard', 'What is the capital of Cabo Verde?', ['Praia', 'Mindelo', 'São Tomé', 'Bissau'], 'Praia, on Santiago island, is Cabo Verde’s capital.', ['CV'], 'Praia'],
  ['geography', 'hard', 'The Okavango River ends in a large inland delta in which country?', ['Botswana', 'Namibia', 'Angola', 'Zambia'], 'The Okavango spreads into an inland delta in north-western Botswana instead of reaching the sea.', ['BW'], 'Okavango_Delta'],
  ['culture', 'hard', 'The Dogon people, known for villages along the Bandiagara Escarpment, live in which country?', ['Mali', 'Niger', 'Chad', 'Mauritania'], 'The Bandiagara Escarpment in Mali is home to the Dogon and is a UNESCO World Heritage Site.', ['ML'], 'Dogon_people'],
  ['culture', 'hard', 'The Gnawa spiritual music tradition is most associated with which country?', ['Morocco', 'Senegal', 'Ethiopia', 'Madagascar'], 'Gnawa music, with the guembri lute and metal castanets, is strongly associated with Morocco.', ['MA'], 'Gnawa_music'],
  ['languages', 'hard', 'Malagasy, the language of Madagascar, belongs to which language family?', ['Austronesian', 'Niger–Congo (Bantu)', 'Afroasiatic', 'Nilo-Saharan'], 'Malagasy is Austronesian, closely related to languages of Borneo.', ['MG'], 'Malagasy_language'],
  ['languages', 'hard', 'The N’Ko script, created by Solomana Kanté in 1949, was designed for which languages?', ['Manding languages such as Bambara and Maninka', 'Wolof', 'Yoruba', 'isiZulu'], 'Solomana Kanté created N’Ko for the Manding languages of West Africa.', ['WEST'], 'N%27Ko_script'],
  ['arts', 'hard', 'Which Senegalese filmmaker directed “Black Girl” (La Noire de…) in 1966?', ['Ousmane Sembène', 'Djibril Diop Mambéty', 'Souleymane Cissé', 'Idrissa Ouédraogo'], 'Ousmane Sembène, often called the father of African cinema, directed “Black Girl”.', ['SN'], 'Ousmane_Semb%C3%A8ne'],
  ['arts', 'hard', 'The Benin Bronzes come from the historic Kingdom of Benin, in which present-day country?', ['Nigeria', 'The Republic of Benin', 'Ghana', 'Togo'], 'The Kingdom of Benin was centred on Benin City in today’s Nigeria — not the Republic of Benin.', ['NG'], 'Benin_Bronzes'],
  ['sports', 'hard', 'Which Ethiopian runner won the 1960 Olympic marathon in Rome running barefoot?', ['Abebe Bikila', 'Mamo Wolde', 'Miruts Yifter', 'Kenenisa Bekele'], 'Abebe Bikila won barefoot in Rome in 1960 and won again in Tokyo in 1964.', ['ET'], 'Abebe_Bikila'],
  ['sports', 'hard', 'Which country won the first Africa Cup of Nations, in 1957?', ['Egypt', 'Ethiopia', 'Sudan', 'Ghana'], 'Egypt won the first Africa Cup of Nations, held in Sudan in 1957.', ['EG'], '1957_African_Cup_of_Nations'],
  ['science', 'hard', 'The fossil “Lucy” (Australopithecus afarensis) was discovered in 1974 in which country?', ['Ethiopia', 'Kenya', 'Tanzania', 'Chad'], 'Lucy was found at Hadar in Ethiopia’s Afar region in 1974.', ['ET'], 'Lucy_(Australopithecus)'],
  ['science', 'hard', 'The “Cradle of Humankind” World Heritage Site is in which country?', ['South Africa', 'Kenya', 'Ethiopia', 'Tanzania'], 'The Cradle of Humankind, including the Sterkfontein caves, is near Johannesburg, South Africa.', ['ZA'], 'Cradle_of_Humankind'],
  ['society', 'hard', 'Which country elected Africa’s first female head of state, in 2005?', ['Liberia', 'Malawi', 'Ethiopia', 'Tanzania'], 'Ellen Johnson Sirleaf was elected President of Liberia in 2005.', ['LR'], 'Ellen_Johnson_Sirleaf'],
  ['society', 'hard', 'The Organisation of African Unity was founded in 1963 in which city?', ['Addis Ababa', 'Accra', 'Cairo', 'Lagos'], 'The OAU was founded in Addis Ababa in May 1963; it was replaced by the African Union in 2002.', ['ET'], 'Organisation_of_African_Unity'],
  ['innovation', 'hard', 'Which Nigerian payments company did Stripe acquire in 2020?', ['Paystack', 'Flutterwave', 'Interswitch', 'OPay'], 'Stripe acquired Lagos-based Paystack in 2020.', ['NG'], 'Paystack'],
  ['innovation', 'hard', 'The crisis-mapping platform Ushahidi was created in 2008 in which country?', ['Kenya', 'South Africa', 'Nigeria', 'Ghana'], 'Ushahidi (“testimony” in Kiswahili) was built in Kenya to map reports of violence after the 2007 election.', ['KE'], 'Ushahidi'],
];

export const FIXTURE_QUESTIONS: QuestionInput[] = RAW.map(([categoryId, difficulty, text, opts, explanation, scope, wiki]) => ({
  text,
  options: { A: opts[0], B: opts[1], C: opts[2], D: opts[3] },
  correct: 'A',
  explanation,
  categoryId,
  countryScope: scope,
  difficulty,
  ageRating: 'all',
  tags: ['dev-fixture'],
  language: 'en',
  sources: [{ title: `Wikipedia: ${decodeURIComponent(wiki).replace(/_/g, ' ')}`, url: `https://en.wikipedia.org/wiki/${wiki}` }],
  verifiedAt: null,
  sponsorRef: null,
}));
