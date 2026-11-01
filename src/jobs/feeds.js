// News sources checked daily. Google News search RSS is free and covers English + Marathi papers.
const gnews = (q, lang = 'en') =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:2d`)}&hl=${lang}-IN&gl=IN&ceid=IN:${lang}`;

export const FEEDS = [
  // English searches (already scoped to Maharashtra)
  { name: 'GN: Maharashtra environment', url: gnews('Maharashtra environment protest'), scoped: true },
  { name: 'GN: Maharashtra tree felling', url: gnews('Maharashtra tree felling'), scoped: true },
  { name: 'GN: Maharashtra forest clearance', url: gnews('Maharashtra forest diversion OR clearance'), scoped: true },
  { name: 'GN: Maharashtra pollution', url: gnews('Maharashtra pollution court'), scoped: true },
  { name: 'GN: Maharashtra dam water project', url: gnews('Maharashtra dam project water farmers'), scoped: true },
  { name: 'GN: Maharashtra mining', url: gnews('Maharashtra mining forest tribal'), scoped: true },
  { name: 'GN: Maharashtra mangroves coast', url: gnews('Maharashtra mangroves OR coastal OR fishermen project'), scoped: true },
  { name: 'GN: Maharashtra public hearing', url: gnews('Maharashtra environmental public hearing'), scoped: true },
  // Marathi searches
  { name: 'GN mr: वृक्षतोड', url: gnews('वृक्षतोड विरोध', 'mr'), scoped: true },
  { name: 'GN mr: प्रकल्प विरोध पर्यावरण', url: gnews('प्रकल्प विरोध पर्यावरण', 'mr'), scoped: true },
  { name: 'GN mr: प्रदूषण', url: gnews('प्रदूषण महाराष्ट्र', 'mr'), scoped: true },
  { name: 'GN mr: धरण पाणी प्रकल्प', url: gnews('धरण पाणी प्रकल्प शेतकरी', 'mr'), scoped: true },
  { name: 'GN mr: जनसुनावणी', url: gnews('पर्यावरण जनसुनावणी', 'mr'), scoped: true },
  // General environment outlets (must mention Maharashtra)
  { name: 'Mongabay India', url: 'https://india.mongabay.com/feed/', scoped: false },
];

// Cheap keyword filter that runs BEFORE the AI so only likely-relevant items use the free quota.
export const KEYWORDS = [
  'environment', 'forest', 'tree', 'felling', 'pollution', 'polluted', 'mangrove', 'wetland', 'dam', 'reservoir',
  'river', 'mining', 'mine', 'quarry', 'sand', 'wildlife', 'tiger', 'leopard', 'sanctuary', 'eco-sensitive',
  'clearance', 'public hearing', 'protest', 'agitation', 'displace', 'tribal', 'adivasi', 'fishermen', 'fisherfolk',
  'drought', 'water', 'air quality', 'aqi', 'smog', 'effluent', 'sewage', 'waste', 'landfill', 'incinerat',
  'data centre', 'data center', 'refinery', 'port', 'expressway', 'coastal', 'ngt', 'green tribunal', 'climate',
  'वृक्ष', 'झाड', 'जंगल', 'वन', 'प्रदूषण', 'धरण', 'नदी', 'पाणी', 'खाण', 'उत्खनन', 'वाळू', 'वन्यजीव', 'वाघ',
  'आंदोलन', 'विरोध', 'जनसुनावणी', 'आदिवासी', 'मच्छीमार', 'दुष्काळ', 'कचरा', 'खारफुटी', 'पर्यावरण', 'प्रकल्प',
];

export const MAHARASHTRA_TERMS = [
  'maharashtra', 'mumbai', 'pune', 'nagpur', 'nashik', 'thane', 'solapur', 'kolhapur', 'sangli', 'satara',
  'raigad', 'ratnagiri', 'sindhudurg', 'palghar', 'gadchiroli', 'chandrapur', 'aurangabad', 'sambhajinagar',
  'marathwada', 'vidarbha', 'konkan', 'latur', 'nanded', 'beed', 'jalna', 'amravati', 'akola', 'jalgaon',
  'ahmednagar', 'ahilyanagar', 'dhule', 'wardha', 'yavatmal', 'bhandara', 'gondia', 'osmanabad', 'dharashiv',
  'महाराष्ट्र', 'मुंबई', 'पुणे', 'नागपूर', 'नाशिक',
];
