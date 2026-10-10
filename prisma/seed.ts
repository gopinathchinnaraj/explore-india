// Prisma seed file
// Seeds the database with initial Karnataka destinations
// Run with: npm run seed

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding GoSomewhere database...");

  // Create India
  const india = await prisma.country.upsert({
    where: { code: "IN" },
    update: {},
    create: {
      name: "India",
      code: "IN",
      slug: "india",
      isActive: true,
    },
  });

  // Create Karnataka state
  const karnataka = await prisma.state.upsert({
    where: { slug: "karnataka" },
    update: {},
    create: {
      name: "Karnataka",
      slug: "karnataka",
      countryId: india.id,
      isActive: true,
    },
  });

  console.log("✅ Created India & Karnataka");

  // Create categories
  const categories = await Promise.all([
    prisma.category.upsert({
      where: { slug: "historical" },
      update: {},
      create: { name: "Historical", slug: "historical", icon: "landmark", description: "Ancient ruins, monuments and heritage sites" },
    }),
    prisma.category.upsert({
      where: { slug: "temples" },
      update: {},
      create: { name: "Temples", slug: "temples", icon: "building-2", description: "Sacred temples and religious sites" },
    }),
    prisma.category.upsert({
      where: { slug: "waterfalls" },
      update: {},
      create: { name: "Waterfalls", slug: "waterfalls", icon: "droplets", description: "Scenic waterfalls and water bodies" },
    }),
    prisma.category.upsert({
      where: { slug: "beaches" },
      update: {},
      create: { name: "Beaches", slug: "beaches", icon: "waves", description: "Beautiful coastal beaches" },
    }),
    prisma.category.upsert({
      where: { slug: "hill-stations" },
      update: {},
      create: { name: "Hill Stations", slug: "hill-stations", icon: "mountain", description: "Cool hill stations and mountain retreats" },
    }),
    prisma.category.upsert({
      where: { slug: "wildlife" },
      update: {},
      create: { name: "Wildlife", slug: "wildlife", icon: "paw-print", description: "Wildlife sanctuaries and national parks" },
    }),
    prisma.category.upsert({
      where: { slug: "nature" },
      update: {},
      create: { name: "Nature", slug: "nature", icon: "tree-pine", description: "Nature parks, forests and scenic spots" },
    }),
    prisma.category.upsert({
      where: { slug: "adventure" },
      update: {},
      create: { name: "Adventure", slug: "adventure", icon: "zap", description: "Adventure sports and outdoor activities" },
    }),
    prisma.category.upsert({
      where: { slug: "cities" },
      update: {},
      create: { name: "Cities", slug: "cities", icon: "building", description: "Major cities and urban destinations" },
    }),
    prisma.category.upsert({
      where: { slug: "food" },
      update: {},
      create: { name: "Food", slug: "food", icon: "utensils", description: "Food destinations and culinary experiences" },
    }),
    prisma.category.upsert({
      where: { slug: "culture" },
      update: {},
      create: { name: "Culture", slug: "culture", icon: "palette", description: "Cultural experiences and art" },
    }),
    prisma.category.upsert({
      where: { slug: "unesco" },
      update: {},
      create: { name: "UNESCO", slug: "unesco", icon: "star", description: "UNESCO World Heritage Sites" },
    }),
  ]);

  const categoryMap: Record<string, number> = {};
  categories.forEach((c) => { categoryMap[c.slug] = c.id; });

  console.log("✅ Created categories");

  // Define all Karnataka destinations
  const destinations = [
    {
      name: "Hampi",
      slug: "hampi",
      description: "Hampi is a UNESCO World Heritage Site and the ancient capital of the Vijayanagara Empire. Set amid a surreal landscape of giant boulders along the Tungabhadra River, it features stunning temple complexes, royal enclosures, and market streets frozen in time. The Virupaksha Temple has been in continuous worship for over 1,500 years.",
      latitude: 15.3350,
      longitude: 76.4600,
      address: "Hampi, Vijayanagara District, Karnataka",
      rating: 4.8,
      reviewCount: 45230,
      coverImageUrl: "https://images.unsplash.com/photo-1590077428593-a55bb07c4665?w=1200&q=80",
      categories: ["historical", "temples", "culture", "unesco"],
    },
    {
      name: "Mysuru Palace",
      slug: "mysuru-palace",
      description: "The Mysore Palace, officially called Mysuru Palace, is the official residence of the Wadiyar dynasty. One of the most visited monuments in India, it's a magnificent example of Indo-Saracenic architecture illuminated by 96,000 light bulbs during Dasara. The palace museum houses royal artifacts and art collections.",
      latitude: 12.3052,
      longitude: 76.6551,
      address: "Sayyaji Rao Rd, Mysuru, Karnataka 570001",
      rating: 4.7,
      reviewCount: 89450,
      coverImageUrl: "https://images.unsplash.com/photo-1596422846543-75c6fc197f07?w=1200&q=80",
      categories: ["historical", "culture", "cities"],
    },
    {
      name: "Coorg",
      slug: "coorg",
      description: "Known as the 'Scotland of India', Coorg (Kodagu) is a lush green district in the Western Ghats famous for its coffee and spice plantations, misty hills, and the warrior Kodava culture. The region offers stunning landscapes, waterfalls, wildlife, and trekking trails through pristine forests.",
      latitude: 12.3375,
      longitude: 75.8069,
      address: "Madikeri, Kodagu, Karnataka",
      rating: 4.6,
      reviewCount: 34120,
      coverImageUrl: "https://images.unsplash.com/photo-1623850038629-4b9662a2f4bf?w=1200&q=80",
      categories: ["hill-stations", "nature", "wildlife", "adventure"],
    },
    {
      name: "Gokarna",
      slug: "gokarna",
      description: "Gokarna is a serene coastal town on the Arabian Sea coast, famous for its pristine beaches and the ancient Mahabaleshwar Temple. Unlike Goa, it offers a quieter, more spiritual atmosphere while still featuring beautiful beaches like Om Beach, Half Moon Beach, and Paradise Beach accessible only by boat or trekking.",
      latitude: 14.5479,
      longitude: 74.3188,
      address: "Gokarna, Uttara Kannada, Karnataka",
      rating: 4.5,
      reviewCount: 18760,
      coverImageUrl: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&q=80",
      categories: ["beaches", "temples", "nature"],
    },
    {
      name: "Murudeshwar",
      slug: "murudeshwar",
      description: "Murudeshwar is a coastal town in Uttara Kannada district, home to the world's second-tallest Shiva statue standing 123 feet high. The Murudeshwar Temple with its 20-story gopura (tower) is surrounded by the Arabian Sea on three sides, creating a breathtaking panoramic setting that's unique in all of India.",
      latitude: 14.0946,
      longitude: 74.1082,
      address: "Murudeshwar, Bhatkal Taluk, Karnataka",
      rating: 4.5,
      reviewCount: 22340,
      coverImageUrl: "https://images.unsplash.com/photo-1621961458348-f013d219b50c?w=1200&q=80",
      categories: ["temples", "beaches", "culture"],
    },
    {
      name: "Jog Falls",
      slug: "jog-falls",
      description: "Jog Falls is India's second-highest plunge waterfall, dropping 253 meters from the Sharavathi River. It consists of four distinct falls named Raja, Rani, Rover and Rocket. The falls are most spectacular during and after monsoon season (July-October) when the river carries peak flow.",
      latitude: 14.2264,
      longitude: 74.8145,
      address: "Jog Falls, Sagara, Shivamogga, Karnataka",
      rating: 4.4,
      reviewCount: 28900,
      coverImageUrl: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1200&q=80",
      categories: ["waterfalls", "nature"],
    },
    {
      name: "Chikmagalur",
      slug: "chikmagalur",
      description: "Chikmagalur is the birthplace of coffee in India, nestled in the Western Ghats. The district is characterized by rolling coffee estates, dense forests, mist-covered peaks, and scenic viewpoints. Mullayanagiri, the highest peak in Karnataka at 1,930 m, is located here.",
      latitude: 13.3161,
      longitude: 75.7720,
      address: "Chikmagalur, Karnataka",
      rating: 4.5,
      reviewCount: 19870,
      coverImageUrl: "https://images.unsplash.com/photo-1542204165-65bf26472b9b?w=1200&q=80",
      categories: ["hill-stations", "nature", "food", "adventure"],
    },
    {
      name: "Dandeli",
      slug: "dandeli",
      description: "Dandeli is a wildlife sanctuary and adventure sports hub on the banks of the Kali River. Famous for white-water rafting, kayaking, and jungle safaris, it offers a chance to spot black panthers, tigers, elephants, and a diverse bird population in one of Karnataka's best preserved wilderness areas.",
      latitude: 15.2667,
      longitude: 74.6167,
      address: "Dandeli, Uttara Kannada, Karnataka",
      rating: 4.4,
      reviewCount: 12450,
      coverImageUrl: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=1200&q=80",
      categories: ["wildlife", "adventure", "nature"],
    },
    {
      name: "Bandipur National Park",
      slug: "bandipur",
      description: "Bandipur National Park is one of India's premier tiger reserves and part of the Nilgiri Biosphere Reserve, the largest protected forest area in South Asia. The park is home to Bengal tigers, Indian elephants, leopards, gaurs, and over 200 bird species in a stunning deciduous forest landscape.",
      latitude: 11.6697,
      longitude: 76.6343,
      address: "Bandipur, Chamarajanagara, Karnataka",
      rating: 4.5,
      reviewCount: 15670,
      coverImageUrl: "https://images.unsplash.com/photo-1564760055775-d63b17a55c44?w=1200&q=80",
      categories: ["wildlife", "nature"],
    },
    {
      name: "Kabini",
      slug: "kabini",
      description: "Kabini is one of India's most famous wildlife destinations, known for exceptional tiger and leopard sightings. The Kabini reservoir backwaters create a magical landscape where wildlife gathers during summer. It's particularly famous for the resident black leopard and large elephant herds that frequent the area.",
      latitude: 11.9736,
      longitude: 76.3541,
      address: "Kabini, Nagarhole, Karnataka",
      rating: 4.7,
      reviewCount: 11230,
      coverImageUrl: "https://images.unsplash.com/photo-1551043047-d7d40e03cd3e?w=1200&q=80",
      categories: ["wildlife", "nature"],
    },
    {
      name: "Badami",
      slug: "badami",
      description: "Badami is an ancient town famous for its rock-cut cave temples carved from sandstone cliffs. Dating from the 6th century CE, the four cave temples (three Hindu, one Jain) contain exceptional sculptures and paintings. The town also features the Agastya Lake and the Bhutanatha temples on its banks.",
      latitude: 15.9167,
      longitude: 75.6833,
      address: "Badami, Bagalkot, Karnataka",
      rating: 4.5,
      reviewCount: 13450,
      coverImageUrl: "https://images.unsplash.com/photo-1591811260516-0b28647d8caa?w=1200&q=80",
      categories: ["historical", "temples", "culture"],
    },
    {
      name: "Pattadakal",
      slug: "pattadakal",
      description: "Pattadakal is a UNESCO World Heritage Site featuring a group of 8th-century Hindu and Jain temples representing the culmination of early Chalukyan architecture. The Virupaksha Temple built by Queen Lokamahadevi after her husband's victory is particularly magnificent.",
      latitude: 15.9486,
      longitude: 75.8176,
      address: "Pattadakal, Bagalkot, Karnataka",
      rating: 4.4,
      reviewCount: 7890,
      coverImageUrl: "https://images.unsplash.com/photo-1582510003544-4d00b7f74220?w=1200&q=80",
      categories: ["historical", "temples", "unesco"],
    },
    {
      name: "Aihole",
      slug: "aihole",
      description: "Aihole, the 'Cradle of Indian Architecture', contains over 125 ancient temples from the 4th to 12th centuries. This was the laboratory where early Chalukyan architects experimented with temple construction styles. The Durga Temple, Lad Khan Temple, and Huchimalli Temple are must-visits.",
      latitude: 16.0152,
      longitude: 75.8841,
      address: "Aihole, Bagalkot, Karnataka",
      rating: 4.3,
      reviewCount: 5670,
      coverImageUrl: "https://images.unsplash.com/photo-1627301517152-11505d049236?w=1200&q=80",
      categories: ["historical", "temples", "culture"],
    },
    {
      name: "Udupi",
      slug: "udupi",
      description: "Udupi is a coastal city famous for the Sri Krishna Temple and the invention of the Udupi cuisine, now popular worldwide. The city's culinary heritage includes the iconic Udupi hotel style of cooking. The nearby St Mary's Island with its hexagonal basalt rock formations is a geological wonder.",
      latitude: 13.3409,
      longitude: 74.7421,
      address: "Udupi, Karnataka",
      rating: 4.4,
      reviewCount: 31230,
      coverImageUrl: "https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=1200&q=80",
      categories: ["temples", "food", "culture", "beaches"],
    },
    {
      name: "St Mary's Island",
      slug: "st-marys-island",
      description: "St Mary's Island is a cluster of four small islands off Malpe beach, famous for its distinctive hexagonal basalt rock formations created by volcanic activity 88 million years ago. It's believed Vasco da Gama landed here in 1498. The island is accessible by boat from Malpe.",
      latitude: 13.3572,
      longitude: 74.6506,
      address: "Malpe, Udupi, Karnataka",
      rating: 4.3,
      reviewCount: 9870,
      coverImageUrl: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&q=80",
      categories: ["beaches", "nature"],
    },
    {
      name: "Sakleshpur",
      slug: "sakleshpur",
      description: "Sakleshpur is a verdant hill station in Hassan district surrounded by coffee and cardamom plantations. The Manjarabad Star Fort, the Bisle Ghat viewpoint, the Donigal trek, and the heritage Sakleshpur railway route through tunnels and bridges make it a perfect weekend destination.",
      latitude: 12.9430,
      longitude: 75.7862,
      address: "Sakleshpur, Hassan, Karnataka",
      rating: 4.3,
      reviewCount: 8340,
      coverImageUrl: "https://images.unsplash.com/photo-1542204165-65bf26472b9b?w=1200&q=80",
      categories: ["hill-stations", "nature", "adventure"],
    },
    {
      name: "Agumbe",
      slug: "agumbe",
      description: "Agumbe is called the 'Cherrapunji of South India' as the region receives very high rainfall. This dense rainforest is the setting for Malgudi Days and is home to the king cobra. The Barkana Falls, sunset viewpoint, and the rainforest research station make it a haven for nature lovers.",
      latitude: 13.5017,
      longitude: 75.0956,
      address: "Agumbe, Shivamogga, Karnataka",
      rating: 4.4,
      reviewCount: 6780,
      coverImageUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=1200&q=80",
      categories: ["nature", "waterfalls", "wildlife"],
    },
    {
      name: "Nandi Hills",
      slug: "nandi-hills",
      description: "Nandi Hills, or Nandidurga, is a hill fortress and summer retreat 60 km from Bengaluru. Famous for its early morning fog and stunning sunrise views, it was Tipu Sultan's summer palace. The hilltop features ancient temples, a fort, Tipu Drop cliff, and Bhoga Nandeeshwara temple at its base.",
      latitude: 13.3702,
      longitude: 77.6834,
      address: "Nandi Hills, Chikkaballapura, Karnataka",
      rating: 4.3,
      reviewCount: 45670,
      coverImageUrl: "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=1200&q=80",
      categories: ["hill-stations", "historical", "nature"],
    },
    {
      name: "Skandagiri",
      slug: "skandagiri",
      description: "Skandagiri, also known as Kalavara Durga, is a mountain fortress and popular night trekking destination near Bengaluru. The trek to the summit is best done overnight to witness the sunrise above a sea of clouds. The ancient ruined fort at the 1,450 m summit offers panoramic views.",
      latitude: 13.4167,
      longitude: 77.7000,
      address: "Skandagiri, Chikkaballapura, Karnataka",
      rating: 4.2,
      reviewCount: 23450,
      coverImageUrl: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1200&q=80",
      categories: ["adventure", "hill-stations", "historical"],
    },
    {
      name: "Bengaluru",
      slug: "bengaluru",
      description: "Bengaluru (Bangalore) is India's Silicon Valley and the country's fastest growing metropolis. Known for its pleasant climate, vibrant tech culture, craft beer scene, diverse food, world-class restaurants, Lalbagh and Cubbon Park, it's a city that seamlessly blends colonial heritage with modern innovation.",
      latitude: 12.9716,
      longitude: 77.5946,
      address: "Bengaluru, Karnataka",
      rating: 4.4,
      reviewCount: 234560,
      coverImageUrl: "https://images.unsplash.com/photo-1596176530529-78163a4f7af2?w=1200&q=80",
      categories: ["cities", "food", "culture"],
    },
    {
      name: "Lalbagh Botanical Garden",
      slug: "lalbagh",
      description: "Lalbagh Botanical Garden is a 240-acre botanical garden in Bengaluru, established in 1760 by Hyder Ali. It houses over 1,000 species of plants and the famous Glass House modeled on London's Crystal Palace. The garden hosts biannual flower shows attended by hundreds of thousands.",
      latitude: 12.9507,
      longitude: 77.5848,
      address: "Lalbagh Road, Bengaluru, Karnataka 560027",
      rating: 4.5,
      reviewCount: 67890,
      coverImageUrl: "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=1200&q=80",
      categories: ["nature", "cities", "culture"],
    },
    {
      name: "Cubbon Park",
      slug: "cubbon-park",
      description: "Cubbon Park is a landmark 300-acre green lung in the heart of Bengaluru, established in 1870. The park houses the State Central Library, the Seshadri Iyer Memorial Hall, and the High Court of Karnataka. It's a beloved urban escape featuring diverse tree species and colonial-era buildings.",
      latitude: 12.9763,
      longitude: 77.5929,
      address: "Kasturba Road, Bengaluru, Karnataka",
      rating: 4.4,
      reviewCount: 45230,
      coverImageUrl: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=1200&q=80",
      categories: ["nature", "cities", "historical"],
    },
    {
      name: "Bannerghatta National Park",
      slug: "bannerghatta",
      description: "Bannerghatta National Park, just 22 km from Bengaluru, is a popular wildlife destination featuring a biological park, safari, butterfly park, and zoo. Visitors can take a safari to spot tigers, lions, bears, deer, and elephants just outside India's IT capital.",
      latitude: 12.7970,
      longitude: 77.5774,
      address: "Bannerghatta, Bengaluru, Karnataka",
      rating: 4.2,
      reviewCount: 34560,
      coverImageUrl: "https://images.unsplash.com/photo-1564760055775-d63b17a55c44?w=1200&q=80",
      categories: ["wildlife", "nature"],
    },
    {
      name: "Belur",
      slug: "belur",
      description: "Belur is famous for the Chennakeshava Temple, a masterpiece of Hoysala architecture built over 103 years starting in 1116 CE. Every inch of the temple is covered with intricate carvings depicting scenes from Hindu epics, celestial nymphs (Shilabalikas), and geometric patterns of extraordinary detail.",
      latitude: 13.1642,
      longitude: 75.8604,
      address: "Belur, Hassan, Karnataka",
      rating: 4.6,
      reviewCount: 19870,
      coverImageUrl: "https://images.unsplash.com/photo-1582510003544-4d00b7f74220?w=1200&q=80",
      categories: ["temples", "historical", "culture"],
    },
    {
      name: "Halebidu",
      slug: "halebidu",
      description: "Halebidu (Halebeedu) was the capital of the Hoysala Empire and features the Hoysaleswara Temple, the largest Hoysala structure. The twin temples dedicated to Shiva are adorned with a continuous frieze of elephants, lions, horses, scrolling foliage, and mythological scenes of remarkable craftsmanship.",
      latitude: 13.2152,
      longitude: 75.9943,
      address: "Halebidu, Hassan, Karnataka",
      rating: 4.5,
      reviewCount: 12340,
      coverImageUrl: "https://images.unsplash.com/photo-1591811260516-0b28647d8caa?w=1200&q=80",
      categories: ["temples", "historical", "culture"],
    },
    {
      name: "Shravanabelagola",
      slug: "shravanabelagola",
      description: "Shravanabelagola is a major Jain pilgrimage center home to the monolithic Gommateshwara (Bahubali) statue, the world's largest monolithic free-standing statue at 57.3 feet. Carved from a single granite rock in 981 CE, it's visible from 30 km away and draws millions for the Mahamastakabhisheka ceremony.",
      latitude: 12.8558,
      longitude: 76.4844,
      address: "Shravanabelagola, Hassan, Karnataka",
      rating: 4.6,
      reviewCount: 23450,
      coverImageUrl: "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=1200&q=80",
      categories: ["temples", "historical", "culture"],
    },
    {
      name: "Kudremukh",
      slug: "kudremukh",
      description: "Kudremukh National Park is a biodiversity hotspot in the Western Ghats, named for a peak that resembles a horse's face. The shola-grassland ecosystem is a UNESCO World Heritage Site and one of the most biodiverse areas in Asia. The Kudremukh trek through rolling meadows and mist is breathtaking.",
      latitude: 13.1833,
      longitude: 75.2167,
      address: "Kudremukh, Chikkamagaluru, Karnataka",
      rating: 4.5,
      reviewCount: 11230,
      coverImageUrl: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=1200&q=80",
      categories: ["nature", "wildlife", "adventure", "hill-stations"],
    },
    {
      name: "Yana Caves",
      slug: "yana-caves",
      description: "Yana is a unique rock formation deep in the forests of Uttara Kannada, featuring massive black crystalline limestone outcrops rising 120 meters from the forest floor. The Bhairaveshwara Shikhara and Mohini Shikhara rocks are considered sacred and house shrines within their base. The trek through the forest is an adventure.",
      latitude: 14.6753,
      longitude: 74.6547,
      address: "Yana, Sirsi, Uttara Kannada, Karnataka",
      rating: 4.4,
      reviewCount: 8900,
      coverImageUrl: "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=1200&q=80",
      categories: ["nature", "adventure", "temples"],
    },
    {
      name: "Bheemeshwari",
      slug: "bheemeshwari",
      description: "Bheemeshwari is a picturesque fishing camp and adventure center on the banks of the River Cauvery, 100 km from Bengaluru. It's famous for the Mahseer fish, which can grow over a meter long. Coracle rides, nature trails, zip-lining, and kayaking make it a perfect outdoor getaway.",
      latitude: 12.3667,
      longitude: 77.1667,
      address: "Bheemeshwari, Mandya, Karnataka",
      rating: 4.3,
      reviewCount: 9870,
      coverImageUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=1200&q=80",
      categories: ["adventure", "nature", "wildlife"],
    },
    {
      name: "Virupaksha Temple",
      slug: "virupaksha-temple",
      description: "The Virupaksha Temple in Hampi is one of the oldest functioning temples in India, with continuous worship since the 7th century CE. Dedicated to Lord Shiva, the 50-meter gopura (tower) dominates the landscape. The temple complex includes the sacred elephant Lakshmi, who blesses devotees with her trunk.",
      latitude: 15.3358,
      longitude: 76.4614,
      address: "Hampi Bazaar, Hampi, Karnataka",
      rating: 4.7,
      reviewCount: 28900,
      coverImageUrl: "https://images.unsplash.com/photo-1590077428593-a55bb07c4665?w=1200&q=80",
      categories: ["temples", "historical", "culture"],
    },
    {
      name: "Mysuru",
      slug: "mysuru",
      description: "Mysuru (Mysore) is a regal city in Karnataka, renowned as the 'City of Palaces'. Famous for its Dasara festival, sandalwood products, silk sarees, and yogic traditions, it's one of India's most visited cities. Besides the iconic palace, the Chamundi Hills, Devaraja Market, and Brindavan Gardens are major attractions.",
      latitude: 12.2958,
      longitude: 76.6394,
      address: "Mysuru, Karnataka",
      rating: 4.5,
      reviewCount: 123450,
      coverImageUrl: "https://images.unsplash.com/photo-1596422846543-75c6fc197f07?w=1200&q=80",
      categories: ["cities", "historical", "culture", "food"],
    },
  ];

  console.log(`📍 Creating ${destinations.length} destinations...`);

  for (const dest of destinations) {
    const { categories: destCategories, ...destData } = dest;

    const destination = await prisma.destination.upsert({
      where: { slug: dest.slug },
      update: {
        rating: dest.rating,
        reviewCount: dest.reviewCount,
        coverImageUrl: dest.coverImageUrl,
        description: dest.description,
      },
      create: {
        ...destData,
        countryId: india.id,
        stateId: karnataka.id,
        isActive: true,
      },
    });

    // Add categories
    await Promise.all(
      destCategories.map((catSlug) =>
        prisma.destinationCategory.upsert({
          where: {
            destinationId_categoryId: {
              destinationId: destination.id,
              categoryId: categoryMap[catSlug],
            },
          },
          update: {},
          create: {
            destinationId: destination.id,
            categoryId: categoryMap[catSlug],
          },
        }).catch(() => {}) // Ignore if category doesn't exist
      )
    );

    console.log(`  ✅ ${dest.name}`);
  }

  // ─── Seed spots for Hampi ────────────────────────────────────────────────────
  console.log("\n🏛️  Seeding Hampi spots...");

  const hampi = await prisma.destination.findUnique({
    where: { slug: "hampi" },
    select: { id: true },
  });

  if (hampi) {
    const hampiSpots = [
      {
        name: "Virupaksha Temple",
        slug: "virupaksha-temple-hampi",
        description:
          "One of the oldest functioning temples in India, dedicated to Lord Shiva. The iconic 50-meter gopura (tower) dominates the Hampi skyline. The sacred elephant Lakshmi blesses devotees at the entrance.",
        latitude: 15.335838,
        longitude: 76.46139,
        address: "Hampi Bazaar, Hampi, Vijayanagara, Karnataka 583239",
        rating: 4.7,
        reviewCount: 28900,
        coverImageUrl:
          "https://images.unsplash.com/photo-1590077428593-a55bb07c4665?w=800&q=80",
        discoverySource: "MANUAL",
        discoveryScore: 95,
        isVerified: true,
        categories: ["temples", "historical", "culture"],
      },
      {
        name: "Vijaya Vittala Temple",
        slug: "vijaya-vittala-temple-hampi",
        description:
          "An architectural marvel from the Vijayanagara Empire, famous for its stone chariot and musical pillars that produce different musical notes when tapped. The 56 musical pillars are a marvel of ancient engineering.",
        latitude: 15.338547,
        longitude: 76.477264,
        address: "Vittala Temple Rd, Hampi, Karnataka 583239",
        rating: 4.8,
        reviewCount: 34500,
        coverImageUrl:
          "https://images.unsplash.com/photo-1590077428593-a55bb07c4665?w=800&q=80",
        discoverySource: "MANUAL",
        discoveryScore: 98,
        isVerified: true,
        categories: ["temples", "historical", "culture", "unesco"],
      },
      {
        name: "Stone Chariot",
        slug: "stone-chariot-hampi",
        description:
          "The iconic stone chariot in front of the Vijaya Vittala Temple is one of Hampi's most recognizable symbols. Carved from granite, it was a shrine for Garuda, the vehicle of Vishnu. It's one of the three most famous stone chariots in India.",
        latitude: 15.3383,
        longitude: 76.4771,
        address: "Vittala Temple Complex, Hampi, Karnataka 583239",
        rating: 4.8,
        reviewCount: 22100,
        coverImageUrl:
          "https://images.unsplash.com/photo-1590077428593-a55bb07c4665?w=800&q=80",
        discoverySource: "MANUAL",
        discoveryScore: 90,
        isVerified: true,
        categories: ["historical", "culture"],
      },
      {
        name: "Lotus Mahal",
        slug: "lotus-mahal-hampi",
        description:
          "Lotus Mahal is a two-storeyed pavilion in the Zenana Enclosure of the Royal Centre. Its delicate arched niches, lotus-bud ceilings, and Indo-Islamic architecture distinguish it from the mainly Dravidian style of other Hampi structures.",
        latitude: 15.3271,
        longitude: 76.4701,
        address: "Royal Enclosure, Hampi, Karnataka 583239",
        rating: 4.5,
        reviewCount: 13200,
        coverImageUrl:
          "https://images.unsplash.com/photo-1590077428593-a55bb07c4665?w=800&q=80",
        discoverySource: "MANUAL",
        discoveryScore: 82,
        isVerified: true,
        categories: ["historical", "culture"],
      },
      {
        name: "Hemakuta Hill",
        slug: "hemakuta-hill-hampi",
        description:
          "Hemakuta Hill is a rocky outcrop to the south of the Virupaksha Temple, dotted with early Vijayanagara-era temples (11th–14th century). It offers stunning panoramic views of the Hampi Bazaar and surrounding boulder landscape at sunrise and sunset.",
        latitude: 15.3329,
        longitude: 76.4601,
        address: "Hemakuta Hill, Hampi, Karnataka 583239",
        rating: 4.6,
        reviewCount: 18700,
        coverImageUrl:
          "https://images.unsplash.com/photo-1590077428593-a55bb07c4665?w=800&q=80",
        discoverySource: "MANUAL",
        discoveryScore: 88,
        isVerified: true,
        categories: ["historical", "temples", "nature"],
      },
      {
        name: "Queen's Bath",
        slug: "queens-bath-hampi",
        description:
          "Queen's Bath is an elaborately decorated royal bathing structure with a moat surrounding it and ornamental balconies. Combining Islamic and Hindu architectural elements, the interiors have painted stucco designs. It was used by the royal family for bathing ceremonies.",
        latitude: 15.3237,
        longitude: 76.465,
        address: "Royal Enclosure, Hampi, Karnataka 583239",
        rating: 4.4,
        reviewCount: 8900,
        coverImageUrl:
          "https://images.unsplash.com/photo-1590077428593-a55bb07c4665?w=800&q=80",
        discoverySource: "MANUAL",
        discoveryScore: 78,
        isVerified: true,
        categories: ["historical", "culture"],
      },
      {
        name: "Matanga Hill",
        slug: "matanga-hill-hampi",
        description:
          "Matanga Hill is the highest point in the Hampi boulder landscape and offers the best 360-degree panoramic views of the entire Hampi site. The sunrise from Matanga Hill is one of the most spectacular experiences in Karnataka, with the Tungabhadra River and boulder landscape glowing in golden light.",
        latitude: 15.3381,
        longitude: 76.4684,
        address: "Matanga Hill, Hampi, Karnataka 583239",
        rating: 4.7,
        reviewCount: 16400,
        coverImageUrl:
          "https://images.unsplash.com/photo-1590077428593-a55bb07c4665?w=800&q=80",
        discoverySource: "MANUAL",
        discoveryScore: 85,
        isVerified: true,
        categories: ["nature", "adventure", "historical"],
      },
      {
        name: "Elephant Stables",
        slug: "elephant-stables-hampi",
        description:
          "The Elephant Stables are a row of 11 chambers that once housed the royal elephants of the Vijayanagara Empire. The building features alternating domed and vaulted roofs in a blend of Hindu and Islamic styles. It's one of the largest surviving secular structures from the empire.",
        latitude: 15.3261,
        longitude: 76.4706,
        address: "Royal Enclosure, Hampi, Karnataka 583239",
        rating: 4.5,
        reviewCount: 12600,
        coverImageUrl:
          "https://images.unsplash.com/photo-1590077428593-a55bb07c4665?w=800&q=80",
        discoverySource: "MANUAL",
        discoveryScore: 80,
        isVerified: true,
        categories: ["historical", "culture"],
      },
    ];

    for (const spotData of hampiSpots) {
      const { categories: spotCategories, ...rest } = spotData;

      const spot = await prisma.spot.upsert({
        where: { slug: spotData.slug },
        update: {
          rating: spotData.rating,
          reviewCount: spotData.reviewCount,
          discoveryScore: spotData.discoveryScore,
        },
        create: {
          destinationId: hampi.id,
          ...rest,
          isActive: true,
        },
      });

      // Link categories
      for (const catSlug of spotCategories) {
        const cat = await prisma.category.findUnique({ where: { slug: catSlug } });
        if (cat) {
          await prisma.spotCategory
            .upsert({
              where: { spotId_categoryId: { spotId: spot.id, categoryId: cat.id } },
              update: {},
              create: { spotId: spot.id, categoryId: cat.id },
            })
            .catch(() => {});
        }
      }

      console.log(`  ✅ Spot: ${spot.name}`);
    }

    console.log(`✅ Seeded ${hampiSpots.length} spots for Hampi`);

    // Compute nearby relationships for Hampi
    const hampiSpotRecords = await prisma.spot.findMany({
      where: { destinationId: hampi.id, isActive: true },
      select: { id: true, latitude: true, longitude: true },
    });

    function haversineM(lat1: number, lon1: number, lat2: number, lon2: number) {
      const R = 6371000;
      const dLat = ((lat2 - lat1) * Math.PI) / 180;
      const dLon = ((lon2 - lon1) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) *
          Math.cos((lat2 * Math.PI) / 180) *
          Math.sin(dLon / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    let nearbyCount = 0;
    for (const a of hampiSpotRecords) {
      for (const b of hampiSpotRecords) {
        if (a.id >= b.id) continue;
        const dist = haversineM(a.latitude, a.longitude, b.latitude, b.longitude);
        await prisma.spotNearby
          .upsert({
            where: { spotId_nearbySpotId: { spotId: a.id, nearbySpotId: b.id } },
            create: { spotId: a.id, nearbySpotId: b.id, distanceMeters: dist },
            update: { distanceMeters: dist },
          })
          .catch(() => {});
        await prisma.spotNearby
          .upsert({
            where: { spotId_nearbySpotId: { spotId: b.id, nearbySpotId: a.id } },
            create: { spotId: b.id, nearbySpotId: a.id, distanceMeters: dist },
            update: { distanceMeters: dist },
          })
          .catch(() => {});
        nearbyCount++;
      }
    }
    console.log(`✅ Computed ${nearbyCount} nearby relationships`);
  }

  console.log("\n🎉 Seeding complete!");
  console.log(`   - 1 country (India)`);
  console.log(`   - 1 state (Karnataka)`);
  console.log(`   - ${categories.length} categories`);
  console.log(`   - ${destinations.length} destinations`);
  console.log(`   - 8 spots (Hampi)`);
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
