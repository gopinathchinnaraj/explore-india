// Curated iconic places across every Indian state and union territory.
// Only names, regions and categories live here — coordinates, descriptions and photos are
// fetched from Wikipedia at seed time (prisma/seed-india.ts) so nothing is invented.

export interface CuratedPlace {
  /** Exact English Wikipedia article title */
  wiki: string;
  /** Display name (defaults to the Wikipedia title) */
  name?: string;
  state: string;
  /** The broader destination/area this place belongs to */
  destination: string;
  categories: string[];
}

export const INDIA_STATES: Array<{ name: string; region: string }> = [
  { name: "Andhra Pradesh", region: "South" },
  { name: "Arunachal Pradesh", region: "Northeast" },
  { name: "Assam", region: "Northeast" },
  { name: "Bihar", region: "East" },
  { name: "Chhattisgarh", region: "Central" },
  { name: "Goa", region: "West" },
  { name: "Gujarat", region: "West" },
  { name: "Haryana", region: "North" },
  { name: "Himachal Pradesh", region: "North" },
  { name: "Jharkhand", region: "East" },
  { name: "Karnataka", region: "South" },
  { name: "Kerala", region: "South" },
  { name: "Madhya Pradesh", region: "Central" },
  { name: "Maharashtra", region: "West" },
  { name: "Manipur", region: "Northeast" },
  { name: "Meghalaya", region: "Northeast" },
  { name: "Mizoram", region: "Northeast" },
  { name: "Nagaland", region: "Northeast" },
  { name: "Odisha", region: "East" },
  { name: "Punjab", region: "North" },
  { name: "Rajasthan", region: "North" },
  { name: "Sikkim", region: "Northeast" },
  { name: "Tamil Nadu", region: "South" },
  { name: "Telangana", region: "South" },
  { name: "Tripura", region: "Northeast" },
  { name: "Uttar Pradesh", region: "North" },
  { name: "Uttarakhand", region: "North" },
  { name: "West Bengal", region: "East" },
  { name: "Andaman and Nicobar Islands", region: "Islands" },
  { name: "Chandigarh", region: "North" },
  { name: "Delhi", region: "North" },
  { name: "Jammu and Kashmir", region: "North" },
  { name: "Ladakh", region: "North" },
  { name: "Lakshadweep", region: "Islands" },
  { name: "Puducherry", region: "South" },
];

export const INDIA_PLACES: CuratedPlace[] = [
  // ── Uttar Pradesh ──
  { wiki: "Taj Mahal", state: "Uttar Pradesh", destination: "Agra", categories: ["historical", "unesco", "culture"] },
  { wiki: "Agra Fort", state: "Uttar Pradesh", destination: "Agra", categories: ["historical", "unesco"] },
  { wiki: "Fatehpur Sikri", state: "Uttar Pradesh", destination: "Agra", categories: ["historical", "unesco"] },
  { wiki: "Dashashwamedh Ghat", state: "Uttar Pradesh", destination: "Varanasi", categories: ["culture", "temples"] },
  { wiki: "Kashi Vishwanath Temple", state: "Uttar Pradesh", destination: "Varanasi", categories: ["temples", "culture"] },
  { wiki: "Sarnath", state: "Uttar Pradesh", destination: "Varanasi", categories: ["historical", "culture"] },
  { wiki: "Bara Imambara", state: "Uttar Pradesh", destination: "Lucknow", categories: ["historical", "food"] },

  // ── Delhi ──
  { wiki: "Red Fort", state: "Delhi", destination: "Delhi", categories: ["historical", "unesco"] },
  { wiki: "Qutb Minar", state: "Delhi", destination: "Delhi", categories: ["historical", "unesco"] },
  { wiki: "Humayun's Tomb", state: "Delhi", destination: "Delhi", categories: ["historical", "unesco"] },
  { wiki: "India Gate", state: "Delhi", destination: "Delhi", categories: ["historical", "cities"] },
  { wiki: "Lotus Temple", state: "Delhi", destination: "Delhi", categories: ["temples", "culture"] },
  { wiki: "Chandni Chowk", state: "Delhi", destination: "Delhi", categories: ["food", "culture", "cities"] },
  { wiki: "Akshardham (Delhi)", name: "Swaminarayan Akshardham", state: "Delhi", destination: "Delhi", categories: ["temples", "culture"] },

  // ── Rajasthan ──
  { wiki: "Amer Fort", state: "Rajasthan", destination: "Jaipur", categories: ["historical", "unesco"] },
  { wiki: "Hawa Mahal", state: "Rajasthan", destination: "Jaipur", categories: ["historical", "culture"] },
  { wiki: "Jantar Mantar, Jaipur", name: "Jantar Mantar", state: "Rajasthan", destination: "Jaipur", categories: ["historical", "unesco"] },
  { wiki: "Mehrangarh", name: "Mehrangarh Fort", state: "Rajasthan", destination: "Jodhpur", categories: ["historical"] },
  { wiki: "Jaisalmer Fort", state: "Rajasthan", destination: "Jaisalmer", categories: ["historical", "unesco"] },
  { wiki: "Lake Pichola", state: "Rajasthan", destination: "Udaipur", categories: ["nature", "culture"] },
  { wiki: "City Palace, Udaipur", name: "City Palace Udaipur", state: "Rajasthan", destination: "Udaipur", categories: ["historical"] },
  { wiki: "Ranthambore National Park", state: "Rajasthan", destination: "Sawai Madhopur", categories: ["wildlife", "nature"] },
  { wiki: "Pushkar Lake", state: "Rajasthan", destination: "Pushkar", categories: ["culture", "temples"] },
  { wiki: "Dilwara Temples", state: "Rajasthan", destination: "Mount Abu", categories: ["temples", "historical"] },
  { wiki: "Chittor Fort", state: "Rajasthan", destination: "Chittorgarh", categories: ["historical", "unesco"] },

  // ── Punjab, Haryana, Chandigarh ──
  { wiki: "Golden Temple", state: "Punjab", destination: "Amritsar", categories: ["temples", "culture", "food"] },
  { wiki: "Jallianwala Bagh", state: "Punjab", destination: "Amritsar", categories: ["historical"] },
  { wiki: "Rock Garden of Chandigarh", state: "Chandigarh", destination: "Chandigarh", categories: ["culture", "cities"] },
  { wiki: "Brahma Sarovar", state: "Haryana", destination: "Kurukshetra", categories: ["temples", "culture"] },

  // ── Himachal Pradesh ──
  { wiki: "Rohtang Pass", state: "Himachal Pradesh", destination: "Manali", categories: ["adventure", "hill-stations"] },
  { wiki: "Hidimba Devi Temple", state: "Himachal Pradesh", destination: "Manali", categories: ["temples", "nature"] },
  { wiki: "The Ridge, Shimla", name: "The Ridge Shimla", state: "Himachal Pradesh", destination: "Shimla", categories: ["hill-stations", "cities"] },
  { wiki: "Key Monastery", state: "Himachal Pradesh", destination: "Spiti Valley", categories: ["culture", "adventure"] },
  { wiki: "Namgyal Monastery", name: "Tsuglagkhang (Dalai Lama Temple)", state: "Himachal Pradesh", destination: "McLeod Ganj", categories: ["culture", "temples"] },

  // ── Jammu & Kashmir, Ladakh ──
  { wiki: "Dal Lake", state: "Jammu and Kashmir", destination: "Srinagar", categories: ["nature", "culture"] },
  { wiki: "Gulmarg", state: "Jammu and Kashmir", destination: "Gulmarg", categories: ["hill-stations", "adventure"] },
  { wiki: "Sonamarg", state: "Jammu and Kashmir", destination: "Sonamarg", categories: ["nature", "hill-stations"] },
  { wiki: "Vaishno Devi Temple", name: "Vaishno Devi", state: "Jammu and Kashmir", destination: "Katra", categories: ["temples"] },
  { wiki: "Pangong Tso", name: "Pangong Lake", state: "Ladakh", destination: "Leh", categories: ["nature", "adventure"] },
  { wiki: "Thiksey Monastery", state: "Ladakh", destination: "Leh", categories: ["culture", "historical"] },
  { wiki: "Khardung La", state: "Ladakh", destination: "Leh", categories: ["adventure"] },
  { wiki: "Nubra Valley", state: "Ladakh", destination: "Nubra", categories: ["nature", "adventure"] },

  // ── Uttarakhand ──
  { wiki: "Valley of Flowers National Park", name: "Valley of Flowers", state: "Uttarakhand", destination: "Chamoli", categories: ["nature", "unesco", "adventure"] },
  { wiki: "Kedarnath Temple", state: "Uttarakhand", destination: "Kedarnath", categories: ["temples", "adventure"] },
  { wiki: "Lakshman Jhula", state: "Uttarakhand", destination: "Rishikesh", categories: ["adventure", "culture"] },
  { wiki: "Har Ki Pauri", state: "Uttarakhand", destination: "Haridwar", categories: ["culture", "temples"] },
  { wiki: "Naini Lake", state: "Uttarakhand", destination: "Nainital", categories: ["hill-stations", "nature"] },
  { wiki: "Jim Corbett National Park", state: "Uttarakhand", destination: "Corbett", categories: ["wildlife", "nature"] },

  // ── Gujarat ──
  { wiki: "Statue of Unity", state: "Gujarat", destination: "Kevadia", categories: ["culture", "cities"] },
  { wiki: "Great Rann of Kutch", name: "Rann of Kutch", state: "Gujarat", destination: "Kutch", categories: ["nature", "culture"] },
  { wiki: "Gir National Park", state: "Gujarat", destination: "Sasan Gir", categories: ["wildlife", "nature"] },
  { wiki: "Rani ki vav", name: "Rani ki Vav", state: "Gujarat", destination: "Patan", categories: ["historical", "unesco"] },
  { wiki: "Somnath temple", name: "Somnath Temple", state: "Gujarat", destination: "Somnath", categories: ["temples", "beaches"] },
  { wiki: "Dwarkadhish Temple", state: "Gujarat", destination: "Dwarka", categories: ["temples"] },

  // ── Maharashtra ──
  { wiki: "Gateway of India", state: "Maharashtra", destination: "Mumbai", categories: ["historical", "cities"] },
  { wiki: "Marine Drive, Mumbai", name: "Marine Drive", state: "Maharashtra", destination: "Mumbai", categories: ["cities", "beaches"] },
  { wiki: "Chhatrapati Shivaji Terminus", state: "Maharashtra", destination: "Mumbai", categories: ["historical", "unesco"] },
  { wiki: "Ajanta Caves", state: "Maharashtra", destination: "Chhatrapati Sambhajinagar", categories: ["historical", "unesco", "culture"] },
  { wiki: "Ellora Caves", state: "Maharashtra", destination: "Chhatrapati Sambhajinagar", categories: ["historical", "unesco", "temples"] },
  { wiki: "Shaniwar Wada", state: "Maharashtra", destination: "Pune", categories: ["historical"] },
  { wiki: "Lonavala", state: "Maharashtra", destination: "Lonavala", categories: ["hill-stations", "nature"] },

  // ── Goa ──
  { wiki: "Basilica of Bom Jesus", state: "Goa", destination: "Old Goa", categories: ["historical", "unesco", "culture"] },
  { wiki: "Baga Beach", name: "Baga Beach", state: "Goa", destination: "North Goa", categories: ["beaches", "food"] },
  { wiki: "Palolem Beach", state: "Goa", destination: "South Goa", categories: ["beaches", "nature"] },
  { wiki: "Dudhsagar Falls", state: "Goa", destination: "Mollem", categories: ["waterfalls", "nature"] },
  { wiki: "Fort Aguada", state: "Goa", destination: "North Goa", categories: ["historical", "beaches"] },

  // ── Madhya Pradesh & Chhattisgarh ──
  { wiki: "Khajuraho Group of Monuments", name: "Khajuraho Temples", state: "Madhya Pradesh", destination: "Khajuraho", categories: ["temples", "unesco", "historical"] },
  { wiki: "Sanchi", name: "Sanchi Stupa", state: "Madhya Pradesh", destination: "Sanchi", categories: ["historical", "unesco"] },
  { wiki: "Kanha Tiger Reserve", name: "Kanha National Park", state: "Madhya Pradesh", destination: "Kanha", categories: ["wildlife", "nature"] },
  { wiki: "Bandhavgarh National Park", state: "Madhya Pradesh", destination: "Bandhavgarh", categories: ["wildlife"] },
  { wiki: "Gwalior Fort", state: "Madhya Pradesh", destination: "Gwalior", categories: ["historical"] },
  { wiki: "Bhimbetka rock shelters", name: "Bhimbetka Rock Shelters", state: "Madhya Pradesh", destination: "Bhopal", categories: ["historical", "unesco"] },
  { wiki: "Chitrakote Falls", state: "Chhattisgarh", destination: "Bastar", categories: ["waterfalls", "nature"] },

  // ── Karnataka (iconic additions) ──
  { wiki: "Mysore Palace", state: "Karnataka", destination: "Mysuru", categories: ["historical", "culture"] },
  { wiki: "Virupaksha Temple, Hampi", name: "Virupaksha Temple", state: "Karnataka", destination: "Hampi", categories: ["temples", "unesco", "historical"] },
  { wiki: "Jog Falls", state: "Karnataka", destination: "Shivamogga", categories: ["waterfalls", "nature"] },
  { wiki: "Gommateshwara statue", name: "Gommateshwara Statue", state: "Karnataka", destination: "Shravanabelagola", categories: ["temples", "historical"] },

  // ── Kerala ──
  { wiki: "Munnar", state: "Kerala", destination: "Munnar", categories: ["hill-stations", "nature"] },
  { wiki: "Alappuzha", name: "Alappuzha Backwaters", state: "Kerala", destination: "Alappuzha", categories: ["nature", "culture"] },
  { wiki: "Varkala Beach", state: "Kerala", destination: "Varkala", categories: ["beaches"] },
  { wiki: "Periyar National Park", state: "Kerala", destination: "Thekkady", categories: ["wildlife", "nature"] },
  { wiki: "Athirappilly Falls", state: "Kerala", destination: "Thrissur", categories: ["waterfalls", "nature"] },
  { wiki: "Fort Kochi", state: "Kerala", destination: "Kochi", categories: ["historical", "culture", "food"] },
  { wiki: "Padmanabhaswamy Temple", state: "Kerala", destination: "Thiruvananthapuram", categories: ["temples"] },

  // ── Tamil Nadu ──
  { wiki: "Meenakshi Temple", name: "Meenakshi Amman Temple", state: "Tamil Nadu", destination: "Madurai", categories: ["temples", "culture"] },
  { wiki: "Brihadisvara Temple, Thanjavur", name: "Brihadeeswarar Temple", state: "Tamil Nadu", destination: "Thanjavur", categories: ["temples", "unesco", "historical"] },
  { wiki: "Group of Monuments at Mahabalipuram", name: "Mahabalipuram Monuments", state: "Tamil Nadu", destination: "Mahabalipuram", categories: ["historical", "unesco", "beaches"] },
  { wiki: "Ramanathaswamy Temple", state: "Tamil Nadu", destination: "Rameswaram", categories: ["temples"] },
  { wiki: "Vivekananda Rock Memorial", state: "Tamil Nadu", destination: "Kanyakumari", categories: ["culture", "beaches"] },
  { wiki: "Ooty", name: "Ooty", state: "Tamil Nadu", destination: "Nilgiris", categories: ["hill-stations", "nature"] },
  { wiki: "Marina Beach", state: "Tamil Nadu", destination: "Chennai", categories: ["beaches", "cities"] },

  // ── Andhra Pradesh & Telangana ──
  { wiki: "Venkateswara Temple, Tirumala", name: "Tirumala Venkateswara Temple", state: "Andhra Pradesh", destination: "Tirupati", categories: ["temples"] },
  { wiki: "Araku Valley", state: "Andhra Pradesh", destination: "Visakhapatnam", categories: ["hill-stations", "nature"] },
  { wiki: "Borra Caves", state: "Andhra Pradesh", destination: "Visakhapatnam", categories: ["nature", "adventure"] },
  { wiki: "Charminar", state: "Telangana", destination: "Hyderabad", categories: ["historical", "food", "cities"] },
  { wiki: "Golconda Fort", state: "Telangana", destination: "Hyderabad", categories: ["historical"] },
  { wiki: "Ramappa Temple", state: "Telangana", destination: "Warangal", categories: ["temples", "unesco", "historical"] },

  // ── Odisha ──
  { wiki: "Konark Sun Temple", state: "Odisha", destination: "Konark", categories: ["temples", "unesco", "historical"] },
  { wiki: "Jagannath Temple, Puri", name: "Jagannath Temple", state: "Odisha", destination: "Puri", categories: ["temples", "culture"] },
  { wiki: "Chilika Lake", state: "Odisha", destination: "Chilika", categories: ["nature", "wildlife"] },

  // ── West Bengal ──
  { wiki: "Victoria Memorial, Kolkata", name: "Victoria Memorial", state: "West Bengal", destination: "Kolkata", categories: ["historical", "cities"] },
  { wiki: "Howrah Bridge", state: "West Bengal", destination: "Kolkata", categories: ["cities", "historical"] },
  { wiki: "Sundarbans National Park", name: "Sundarbans", state: "West Bengal", destination: "Sundarbans", categories: ["wildlife", "unesco", "nature"] },
  { wiki: "Darjeeling Himalayan Railway", state: "West Bengal", destination: "Darjeeling", categories: ["unesco", "hill-stations", "adventure"] },
  { wiki: "Tiger Hill, Darjeeling", name: "Tiger Hill", state: "West Bengal", destination: "Darjeeling", categories: ["hill-stations", "nature"] },

  // ── Bihar & Jharkhand ──
  { wiki: "Mahabodhi Temple", state: "Bihar", destination: "Bodh Gaya", categories: ["temples", "unesco", "historical"] },
  { wiki: "Nalanda mahavihara", name: "Nalanda University Ruins", state: "Bihar", destination: "Nalanda", categories: ["historical", "unesco"] },
  { wiki: "Hundru Falls", state: "Jharkhand", destination: "Ranchi", categories: ["waterfalls", "nature"] },

  // ── Northeast ──
  { wiki: "Kaziranga National Park", state: "Assam", destination: "Kaziranga", categories: ["wildlife", "unesco", "nature"] },
  { wiki: "Kamakhya Temple", state: "Assam", destination: "Guwahati", categories: ["temples"] },
  { wiki: "Majuli", state: "Assam", destination: "Majuli", categories: ["culture", "nature"] },
  { wiki: "Tawang Monastery", state: "Arunachal Pradesh", destination: "Tawang", categories: ["culture", "historical"] },
  { wiki: "Sela Pass", state: "Arunachal Pradesh", destination: "Tawang", categories: ["adventure", "hill-stations"] },
  { wiki: "Ziro", name: "Ziro Valley", state: "Arunachal Pradesh", destination: "Ziro", categories: ["nature", "culture"] },
  { wiki: "Nongriat", name: "Living Root Bridges", state: "Meghalaya", destination: "Cherrapunji", categories: ["nature", "adventure"] },
  { wiki: "Nohkalikai Falls", state: "Meghalaya", destination: "Cherrapunji", categories: ["waterfalls", "nature"] },
  { wiki: "Mawlynnong", state: "Meghalaya", destination: "Mawlynnong", categories: ["nature", "culture"] },
  { wiki: "Dawki", name: "Umngot River", state: "Meghalaya", destination: "Dawki", categories: ["nature", "adventure"] },
  { wiki: "Loktak Lake", state: "Manipur", destination: "Moirang", categories: ["nature", "wildlife"] },
  { wiki: "Dzükou Valley", name: "Dzükou Valley", state: "Nagaland", destination: "Kohima", categories: ["adventure", "nature"] },
  { wiki: "Kisama Heritage Village", state: "Nagaland", destination: "Kohima", categories: ["culture"] },
  { wiki: "Vantawng Falls", state: "Mizoram", destination: "Thenzawl", categories: ["waterfalls", "nature"] },
  { wiki: "Ujjayanta Palace", state: "Tripura", destination: "Agartala", categories: ["historical"] },
  { wiki: "Neermahal", state: "Tripura", destination: "Melaghar", categories: ["historical", "nature"] },
  { wiki: "Tsomgo Lake", state: "Sikkim", destination: "Gangtok", categories: ["nature", "adventure"] },
  { wiki: "Rumtek Monastery", state: "Sikkim", destination: "Gangtok", categories: ["culture"] },
  { wiki: "Nathu La", state: "Sikkim", destination: "Gangtok", categories: ["adventure", "historical"] },

  // ── Islands & Puducherry ──
  { wiki: "Radhanagar Beach", state: "Andaman and Nicobar Islands", destination: "Swaraj Dweep", categories: ["beaches", "nature"] },
  { wiki: "Cellular Jail", state: "Andaman and Nicobar Islands", destination: "Port Blair", categories: ["historical"] },
  { wiki: "Agatti Island", state: "Lakshadweep", destination: "Agatti", categories: ["beaches", "adventure"] },
  { wiki: "Promenade Beach", state: "Puducherry", destination: "Puducherry", categories: ["beaches", "culture"] },
  { wiki: "Auroville", state: "Puducherry", destination: "Auroville", categories: ["culture"] },
];
