// Curated cinematic journeys across India. Stops are matched to approved spots by name at
// runtime, so a journey simply skips any stop that isn't in the database.

export interface Journey {
  id: string;
  title: string;
  tagline: string;
  /** Accent used for the route line and journey card */
  color: string;
  stops: string[];
}

/** Cinematic tours across the globe (resolved to spots by name at runtime) */
export const INDIA_JOURNEYS: Journey[] = [
  {
    id: "golden-triangle",
    color: "#f59e0b",
    title: "The Golden Triangle",
    tagline: "Delhi, Agra & Jaipur — India's classic first trip",
    stops: ["Red Fort", "Qutb Minar", "Humayun's Tomb", "Taj Mahal", "Agra Fort", "Fatehpur Sikri", "Amber Fort", "Hawa Mahal"],
  },
  {
    id: "himalayan-high",
    color: "#38bdf8",
    title: "Himalayan High",
    tagline: "Mountain passes, monasteries and alpine lakes",
    stops: ["Dal Lake", "Gulmarg", "Pangong Lake", "Thikse Monastery", "Khardung La", "Key Monastery", "Rohtang Pass", "Valley of Flowers"],
  },
  {
    id: "temples-south",
    color: "#a855f7",
    title: "Temples of the South",
    tagline: "Dravidian masterpieces from Hampi to Rameswaram",
    stops: ["Virupaksha Temple", "Tirumala Venkateswara Temple", "Mahabalipuram Monuments", "Brihadeeswarar Temple", "Meenakshi Amman Temple", "Ramanathaswamy Temple", "Padmanabhaswamy Temple"],
  },
  {
    id: "royal-rajasthan",
    color: "#f43f5e",
    title: "Royal Rajasthan",
    tagline: "Desert forts, lake palaces and tiger country",
    stops: ["Amber Fort", "Jantar Mantar", "Ranthambore National Park", "Chittor Fort", "City Palace Udaipur", "Lake Pichola", "Mehrangarh Fort", "Jaisalmer Fort"],
  },
  {
    id: "seven-sisters",
    color: "#22c55e",
    title: "The Seven Sisters",
    tagline: "Living root bridges and cloud forests of the Northeast",
    stops: ["Kaziranga National Park", "Kamakhya Temple", "Living Root Bridges", "Nohkalikai Falls", "Umngot River", "Loktak Lake", "Dzükou Valley", "Tawang Monastery"],
  },
  {
    id: "coast-to-coast",
    color: "#06b6d4",
    title: "Coast to Coast",
    tagline: "Beaches and backwaters around the peninsula",
    stops: ["Baga Beach", "Palolem Beach", "Varkala Beach", "Alappuzha Backwaters", "Vivekananda Rock Memorial", "Marina Beach", "Promenade Beach", "Radhanagar Beach"],
  },
];
