
export type DiseaseCare = {
  symptoms: string[];
  treatment: string[];
  prevention: string[];
  organic: string[];
};

const healthyCare: DiseaseCare = {
  symptoms: [
    "The leaf appears healthy with no obvious disease symptoms.",
    "Continue monitoring new leaves and plant growth.",
  ],
  treatment: [
    "No disease treatment is required based on this result.",
    "Maintain balanced watering and suitable growing conditions.",
  ],
  prevention: [
    "Inspect leaves regularly for unusual spots or colour changes.",
    "Keep the greenhouse clean and well ventilated.",
  ],
  organic: [
    "Use compost to support healthy soil.",
    "Remove dead leaves and plant debris.",
  ],
};

const defaultCare: DiseaseCare = {
  symptoms: [
    "Unusual leaf spots, colour changes or damaged areas may be present.",
    "Symptoms can vary depending on the crop and disease.",
  ],
  treatment: [
    "Remove badly affected leaves using clean tools.",
    "Avoid wetting leaves while watering.",
    "Seek local agricultural advice before using a pesticide or fungicide.",
  ],
  prevention: [
    "Provide enough spacing and airflow between plants.",
    "Avoid overwatering and waterlogging.",
    "Clean gardening tools regularly.",
    "Check nearby plants for similar symptoms.",
  ],
  organic: [
    "Remove fallen and infected plant material.",
    "Use mature compost to support soil health.",
    "Consider a locally recommended organic treatment after confirming the disease.",
  ],
};

const diseaseCare: Record<string, DiseaseCare> = {
  early_blight: {
    symptoms: [
      "Brown spots may appear on older leaves.",
      "Spots can develop ring-like patterns.",
      "Yellowing may occur around affected areas.",
    ],
    treatment: [
      "Remove badly infected leaves and dispose of them safely.",
      "Avoid overhead watering.",
      "Improve airflow around the plant.",
      "Ask an agricultural expert about an approved fungicide if symptoms spread.",
    ],
    prevention: [
      "Rotate crops where practical.",
      "Avoid leaving infected plant debris in the greenhouse.",
      "Water near the soil rather than over the leaves.",
    ],
    organic: [
      "Remove infected leaves promptly.",
      "Use clean mulch to reduce soil splash.",
      "Maintain healthy soil with mature compost.",
    ],
  },

  late_blight: {
    symptoms: [
      "Dark, water-soaked patches may appear on leaves.",
      "White fungal growth may develop under humid conditions.",
      "The disease can spread quickly in cool, wet conditions.",
    ],
    treatment: [
      "Isolate affected plants if possible.",
      "Remove severely infected plant parts.",
      "Avoid handling healthy plants after touching infected plants.",
      "Get local agricultural advice quickly because this disease can spread rapidly.",
    ],
    prevention: [
      "Keep leaves dry and improve ventilation.",
      "Avoid overcrowding plants.",
      "Inspect plants frequently during humid weather.",
    ],
    organic: [
      "Remove infected plant material safely.",
      "Clean tools and growing areas.",
      "Use disease-free planting material.",
    ],
  },

  leaf_mold: {
    symptoms: [
      "Yellow patches may appear on the upper leaf surface.",
      "Olive-green or grey growth may appear underneath leaves.",
      "Affected leaves may dry and fall.",
    ],
    treatment: [
      "Remove badly affected leaves.",
      "Improve air circulation.",
      "Reduce excessive humidity.",
      "Seek expert advice if the disease continues spreading.",
    ],
    prevention: [
      "Avoid overcrowding plants.",
      "Maintain suitable greenhouse ventilation.",
      "Water at the base of plants.",
    ],
    organic: [
      "Remove fallen leaves from the growing area.",
      "Keep greenhouse surfaces clean.",
      "Maintain balanced watering.",
    ],
  },

  powdery_mildew: {
    symptoms: [
      "White powder-like patches may appear on leaves.",
      "Leaves may become yellow or distorted.",
      "Severe infections can reduce plant growth.",
    ],
    treatment: [
      "Remove severely affected leaves.",
      "Improve airflow around plants.",
      "Avoid excessive nitrogen fertiliser.",
      "Use only locally approved treatments after confirming the disease.",
    ],
    prevention: [
      "Maintain suitable spacing between plants.",
      "Monitor humidity and ventilation.",
      "Inspect new leaves regularly.",
    ],
    organic: [
      "Remove infected plant debris.",
      "Maintain good plant spacing.",
      "Use a locally approved organic treatment if recommended.",
    ],
  },

  bacterial_spot: {
    symptoms: [
      "Small dark or water-soaked spots may appear on leaves.",
      "Spots may develop yellow edges.",
      "Affected leaves may dry or fall.",
    ],
    treatment: [
      "Remove severely affected leaves.",
      "Avoid working with plants while they are wet.",
      "Disinfect tools between plants.",
      "Consult an agricultural expert before selecting a treatment.",
    ],
    prevention: [
      "Use healthy seeds and seedlings.",
      "Avoid overhead irrigation.",
      "Keep greenhouse tools and surfaces clean.",
    ],
    organic: [
      "Remove infected plant debris.",
      "Use clean planting material.",
      "Avoid spreading water from infected plants to healthy plants.",
    ],
  },

  septoria_leaf_spot: {
    symptoms: [
      "Small circular spots may appear on older leaves.",
      "Spots may have grey centres and dark edges.",
      "Leaves may turn yellow and fall.",
    ],
    treatment: [
      "Remove affected lower leaves.",
      "Keep leaves dry during irrigation.",
      "Dispose of infected plant debris.",
      "Seek local advice if symptoms continue.",
    ],
    prevention: [
      "Rotate crops where possible.",
      "Maintain good spacing.",
      "Avoid splashing soil onto leaves.",
    ],
    organic: [
      "Remove fallen leaves regularly.",
      "Use clean mulch to reduce soil splash.",
      "Keep tools clean.",
    ],
  },

  leaf_rust: {
    symptoms: [
      "Orange, yellow or brown powdery spots may appear.",
      "Spots may be visible on the underside of leaves.",
      "Severe infections may cause early leaf drop.",
    ],
    treatment: [
      "Remove heavily infected leaves.",
      "Improve airflow around plants.",
      "Ask an agricultural expert about suitable disease control.",
    ],
    prevention: [
      "Inspect both sides of leaves.",
      "Avoid excessive humidity.",
      "Remove infected plant debris.",
    ],
    organic: [
      "Clean the growing area regularly.",
      "Remove affected leaves safely.",
      "Maintain healthy soil and balanced watering.",
    ],
  },
};

export function getDiseaseCare(condition: string): DiseaseCare {
  const key = condition.toLowerCase().replace(/[\s-]+/g, "_");

  if (
    key.includes("healthy") ||
    key.includes("normal") ||
    key.includes("no_disease")
  ) {
    return healthyCare;
  }

  for (const [diseaseName, care] of Object.entries(diseaseCare)) {
    if (key.includes(diseaseName)) {
      return care;
    }
  }

  return defaultCare;
}

// Convert care recommendations into text for Supabase
export function formatCareText(items: string[]): string {
  return items
    .map((item, index) => `${index + 1}. ${item}`)
    .join("\n");
}
