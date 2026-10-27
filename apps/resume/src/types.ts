export type VariantKey = 'research' | 'product' | 'consultant' | 'visualization';
export type VersionId = string;
export type ResumeMode = 'visual' | 'ats';
export type FontToken = 'display' | 'title' | 'section' | 'label' | 'body' | 'small' | 'tiny';

export type TextBlock = {
  html: string;
  height: number;
};

export type Work = {
  period: string;
  role: string;
  org: string;
  points: string[];
};

export type Project = {
  title: string;
  meta: string;
  text: string;
  points?: string[];
};

export type Publication = {
  venue: string;
  year: string;
  title: string;
};

export type Education = {
  degree: string;
  institution: string;
  period: string;
  details?: string[];
};

export type Profile = {
  name: string;
  aka: string;
  displayName: string;
  firstNamePronunciation: string;
  lastNamePronunciation: string;
  location: string;
  email: string;
  phone: string;
  links: string[];
  contact: string[];
  signal: string[];
  metrics: string[];
  methods: string[];
  education: Education[];
  publications: Publication[];
  languages: string[];
  interests: string[];
  workingStyle: string[];
  toolbox: string[];
  focusAreas: string[];
};

export type Variant = {
  label: string;
  role: string;
  thesis: string;
  letter: string[];
  priorities: string[];
  work: Work[];
  projects: Project[];
  skills: string[];
};

export type LayoutMetrics = {
  mainWidth: number;
  heroMetaWidth: number;
  sectionWidth: number;
  sideWidth: number;
  projectWidth: number;
};

export type AppState = {
  currentVersionId: VersionId;
  currentMode: ResumeMode;
  includeCoverLetter: boolean;
  textScale: number;
  isEditing: boolean;
};

export type ResumeDocument = {
  schemaVersion: 2;
  profile: Profile;
  versions: Record<VersionId, ApplicationVersion>;
  versionOrder: VersionId[];
};

export type ApplicationVersion = {
  id: VersionId;
  kind: 'template' | 'application';
  company: string;
  position: string;
  templateKey: VariantKey;
  content: Variant;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
};

export type EditKind = 'single' | 'multiline';
export type EditScope = 'shared' | 'variant';
export type EditSegment = 'first-name' | 'last-name';

export type EditMeta = {
  path: string;
  label: string;
  kind: EditKind;
  scope: EditScope;
  segment?: EditSegment;
};
