import type { Profile, Project, Variant, VariantKey } from '../types';

export const profile: Profile = {
  "name": "Alex Example",
  "aka": "Alex",
  "displayName": "Alex Example",
  "firstNamePronunciation": "",
  "lastNamePronunciation": "",
  "location": "Your city",
  "email": "alex@example.com",
  "phone": "",
  "links": [
    "example.com"
  ],
  "contact": [
    "alex@example.com",
    "example.com"
  ],
  "signal": [
    "Research",
    "Design"
  ],
  "metrics": [],
  "methods": [
    "Research and prototyping"
  ],
  "education": [
    {
      "degree": "Example Degree",
      "institution": "Example University",
      "period": "2020\u20132024"
    }
  ],
  "publications": [],
  "languages": [],
  "interests": [],
  "workingStyle": [
    "Build and learn"
  ],
  "toolbox": [
    "TypeScript"
  ],
  "focusAreas": [
    "Product research"
  ]
};

export const variants: Record<VariantKey, Variant> = {
  "research": {
    "label": "UX Researcher",
    "role": "UX Researcher",
    "thesis": "Example professional summary. Replace this text in your private version.",
    "letter": [
      "Example cover letter."
    ],
    "priorities": [
      "Understand user needs"
    ],
    "work": [
      {
        "period": "2024\u2013present",
        "role": "Researcher",
        "org": "Example Organisation",
        "points": [
          "Built and evaluated prototypes."
        ]
      }
    ],
    "projects": [
      {
        "title": "Example Project",
        "meta": "Research / Design",
        "text": "A concise description of your work.",
        "points": [
          "Describe the outcome."
        ]
      }
    ],
    "skills": [
      "Research",
      "Prototyping"
    ]
  },
  "product": {
    "label": "Product Researcher",
    "role": "Product Researcher",
    "thesis": "Example professional summary. Replace this text in your private version.",
    "letter": [
      "Example cover letter."
    ],
    "priorities": [
      "Understand user needs"
    ],
    "work": [
      {
        "period": "2024\u2013present",
        "role": "Researcher",
        "org": "Example Organisation",
        "points": [
          "Built and evaluated prototypes."
        ]
      }
    ],
    "projects": [
      {
        "title": "Example Project",
        "meta": "Research / Design",
        "text": "A concise description of your work.",
        "points": [
          "Describe the outcome."
        ]
      }
    ],
    "skills": [
      "Research",
      "Prototyping"
    ]
  },
  "consultant": {
    "label": "Consultant",
    "role": "Consultant",
    "thesis": "Example professional summary. Replace this text in your private version.",
    "letter": [
      "Example cover letter."
    ],
    "priorities": [
      "Understand user needs"
    ],
    "work": [
      {
        "period": "2024\u2013present",
        "role": "Researcher",
        "org": "Example Organisation",
        "points": [
          "Built and evaluated prototypes."
        ]
      }
    ],
    "projects": [
      {
        "title": "Example Project",
        "meta": "Research / Design",
        "text": "A concise description of your work.",
        "points": [
          "Describe the outcome."
        ]
      }
    ],
    "skills": [
      "Research",
      "Prototyping"
    ]
  },
  "visualization": {
    "label": "Visualisation Specialist",
    "role": "Visualisation Specialist",
    "thesis": "Example professional summary. Replace this text in your private version.",
    "letter": [
      "Example cover letter."
    ],
    "priorities": [
      "Understand user needs"
    ],
    "work": [
      {
        "period": "2024\u2013present",
        "role": "Researcher",
        "org": "Example Organisation",
        "points": [
          "Built and evaluated prototypes."
        ]
      }
    ],
    "projects": [
      {
        "title": "Example Project",
        "meta": "Research / Design",
        "text": "A concise description of your work.",
        "points": [
          "Describe the outcome."
        ]
      }
    ],
    "skills": [
      "Research",
      "Prototyping"
    ]
  }
};

export function visualProjects(variantKey: VariantKey, projects: Project[]): Project[] {
  const indicesByVariant: Record<VariantKey, number[]> = {
    research: [0, 5, 1, 4, 2, 3],
    product: [0, 4, 5, 1, 2, 3],
    consultant: [4, 0, 1, 5, 2, 3],
    visualization: [0, 1, 2, 3, 5, 4]
  };

  return indicesByVariant[variantKey].map((index) => projects[index]).filter((project): project is Project => Boolean(project));
}

export function selectedResearchOutput(sourceProfile: Profile) {
  return sourceProfile.publications.slice(0, 4);
}
