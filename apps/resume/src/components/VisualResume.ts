import type { EditKind, EditMeta, Education, LayoutMetrics, Profile, Project, Publication, Variant, VariantKey, Work } from '../types';
import { selectedResearchOutput, visualProjects } from '../data/resume';
import { editAttributes } from '../editor/markup';
import { escapeHtml } from '../utils/html';
import { renderList, renderText } from '../utils/textRenderer';
import './VisualResume.css';

const MM_TO_PX = 96 / 25.4;
const WORK_META_WIDTH = 18 * MM_TO_PX;
const WORK_GAP = 4 * MM_TO_PX;
const PROJECT_META_WIDTH = 38 * MM_TO_PX;
const PROJECT_GAP = 4 * MM_TO_PX;

type VisualResumeProps = {
  profile: Profile;
  variant: Variant;
  variantKey: VariantKey;
  metrics: LayoutMetrics;
};

type VisualCoverLetterProps = {
  profile: Profile;
  variant: Variant;
  metrics: LayoutMetrics;
};

export function wrapVisualPage(pageHtml: string): string {
  return `<div class="page-shell">${pageHtml}</div>`;
}

function sharedEdit(path: string, label: string, kind: EditKind = 'single'): EditMeta {
  return { path, label, kind, scope: 'shared' };
}

function variantEdit(path: string, label: string, kind: EditKind = 'single'): EditMeta {
  return { path: `variant.${path}`, label, kind, scope: 'variant' };
}

function visualNameWithPronunciation(profile: Profile): string {
  const [firstName, ...lastParts] = profile.name.split(' ');
  const lastName = lastParts.join(' ');
  return `
    <span class="name-container">
      <span class="name-group">
        <span class="pronunciation" ${editAttributes(sharedEdit('profile.firstNamePronunciation', 'First name pronunciation'))}>${escapeHtml(profile.firstNamePronunciation)}</span>
        <span class="name-part" ${editAttributes({ ...sharedEdit('profile.name', 'First name'), segment: 'first-name' })}>${escapeHtml(firstName)}</span>
      </span>
      <span class="name-part nickname">“<span ${editAttributes(sharedEdit('profile.aka', 'Preferred name'))}>${escapeHtml(profile.aka)}</span>”</span>
      <span class="name-group">
        <span class="pronunciation" ${editAttributes(sharedEdit('profile.lastNamePronunciation', 'Last name pronunciation'))}>${escapeHtml(profile.lastNamePronunciation)}</span>
        <span class="name-part" ${editAttributes({ ...sharedEdit('profile.name', 'Last name'), segment: 'last-name' })}>${escapeHtml(lastName)}</span>
      </span>
    </span>
  `;
}

function renderContactMeta(profile: Profile): string {
  const contact = [
    { value: profile.email, path: 'profile.email', label: 'Email' },
    { value: profile.phone, path: 'profile.phone', label: 'Phone' },
    { value: profile.location, path: 'profile.location', label: 'Location' }
  ];
  return `
    <div class="contact-meta" aria-label="Contact">
      <div>${contact
        .map((item) => `<span ${editAttributes(sharedEdit(item.path, item.label))}>${escapeHtml(item.value)}</span>`)
        .join(' · ')}</div>
      <div>${profile.links
        .map((link, index) => `<span ${editAttributes(sharedEdit(`profile.links.${index}`, `Link ${index + 1}`))}>${escapeHtml(link)}</span>`)
        .join(' · ')}</div>
    </div>
  `;
}

function renderWork(work: Work, workIndex: number, metrics: LayoutMetrics, pointLimit = work.points.length): string {
  const workBodyWidth = metrics.sectionWidth - WORK_META_WIDTH - WORK_GAP;
  const points = renderList(work.points.slice(0, pointLimit), workBodyWidth, 'small', {
    basePath: `variant.work.${workIndex}.points`,
    label: 'Experience bullet',
    scope: 'variant'
  });
  return `
    <article class="work-item">
      <div class="item-meta" ${editAttributes(variantEdit(`work.${workIndex}.period`, 'Experience period'))}>${escapeHtml(work.period)}</div>
      <div>
        <h3 ${editAttributes(variantEdit(`work.${workIndex}.role`, 'Experience role'))}>${escapeHtml(work.role)}</h3>
        <p class="org" ${editAttributes(variantEdit(`work.${workIndex}.org`, 'Organisation'))}>${escapeHtml(work.org)}</p>
        <ul class="bare-list">${points}</ul>
      </div>
    </article>
  `;
}

function renderProject(project: Project, projectIndex: number, metrics: LayoutMetrics): string {
  const projectTextWidth = Math.max(120, metrics.projectWidth - PROJECT_META_WIDTH - PROJECT_GAP);
  const text = renderText(project.text, projectTextWidth, 'small', '', variantEdit(`projects.${projectIndex}.text`, 'Project description', 'multiline'));
  const proofPoints = project.points
    ?.slice(0, 2)
    .map((point, index) =>
      renderText(point, projectTextWidth - 10, 'tiny', '', variantEdit(`projects.${projectIndex}.points.${index}`, `Project proof point ${index + 1}`, 'multiline'))
    )
    .map((block) => `<li>${block.html}</li>`)
    .join('');
  return `
    <article class="project-card">
      <div class="project-meta" ${editAttributes(variantEdit(`projects.${projectIndex}.meta`, 'Project metadata'))}>${escapeHtml(project.meta)}</div>
      <h3 ${editAttributes(variantEdit(`projects.${projectIndex}.title`, 'Project title'))}>${escapeHtml(project.title)}</h3>
      <div class="project-copy">
        ${text.html}
        ${proofPoints ? `<ul class="project-proof">${proofPoints}</ul>` : ''}
      </div>
    </article>
  `;
}

function renderSidePublication(publication: Publication, publicationIndex: number, metrics: LayoutMetrics): string {
  const title = renderText(publication.title, metrics.sideWidth, 'tiny', '', sharedEdit(`profile.publications.${publicationIndex}.title`, 'Publication title', 'multiline'));
  return `
    <article class="side-publication">
      <div class="publication-meta"><span class="publication-venue" ${editAttributes(sharedEdit(`profile.publications.${publicationIndex}.venue`, 'Publication venue'))}>${escapeHtml(publication.venue)}</span><span ${editAttributes(sharedEdit(`profile.publications.${publicationIndex}.year`, 'Publication year'))}>${escapeHtml(publication.year)}</span></div>
      ${title.html}
    </article>
  `;
}

function renderSideBlock(title: string, items: string[], metrics: LayoutMetrics, basePath?: string, scope: EditMeta['scope'] = 'variant'): string {
  return `
    <section class="side-section">
      <h2>${escapeHtml(title)}</h2>
      <ul class="side-list">
        ${items
          .map((item, index) => {
            const text = renderText(
              item,
              metrics.sideWidth,
              'tiny',
              '',
              basePath
                ? {
                    path: `${scope === 'variant' ? 'variant.' : ''}${basePath}.${index}`,
                    label: `${title} item ${index + 1}`,
                    kind: 'multiline',
                    scope
                  }
                : undefined
            );
            return `<li>${text.html}</li>`;
          })
          .join('')}
      </ul>
    </section>
  `;
}

function renderEducationBlock(items: Education[], metrics: LayoutMetrics): string {
  return `
    <section class="side-section education-section">
      <h2>Education</h2>
      ${items
        .map((item, index) => {
          const heading = renderText(item.degree, metrics.sideWidth, 'tiny', '', sharedEdit(`profile.education.${index}.degree`, 'Education degree', 'multiline'));
          const details = item.details
            ?.map(
              (detail, detailIndex) =>
                `<span ${editAttributes(sharedEdit(`profile.education.${index}.details.${detailIndex}`, `Education detail ${detailIndex + 1}`, 'multiline'))}>${escapeHtml(detail)}</span>`
            )
            .join(' / ');

          return `
            <article class="education-item">
              <h3>${heading.html}</h3>
              <div class="education-meta"><span ${editAttributes(sharedEdit(`profile.education.${index}.institution`, 'Education institution'))}>${escapeHtml(item.institution)}</span>, <span ${editAttributes(sharedEdit(`profile.education.${index}.period`, 'Education period'))}>${escapeHtml(item.period)}</span></div>
              ${details ? `<div class="education-detail">${details}</div>` : ''}
            </article>
          `;
        })
        .join('')}
    </section>
  `;
}

export function VisualCoverLetter({ profile, variant, metrics }: VisualCoverLetterProps): string {
  const dateString = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const contact = renderText([profile.email, profile.phone, profile.location, ...profile.links].join(' / '), metrics.mainWidth, 'small');
  const paragraphs = variant.letter
    .map((paragraph, index) => renderText(paragraph, metrics.mainWidth, 'body', '', variantEdit(`letter.${index}`, `Cover letter paragraph ${index + 1}`, 'multiline')))
    .map((block) => `<div class="letter-paragraph">${block.html}</div>`)
    .join('');

  return `
    <section class="page cover-letter-page">
      <header class="letter-header">
        <h1 ${editAttributes(sharedEdit('profile.name', 'Name'))}>${escapeHtml(profile.name)}</h1>
        ${contact.html}
      </header>
      <div class="letter-date">${escapeHtml(dateString)}</div>
      <div class="letter-recipient">
        <div>Hiring Team</div>
        <div>Re: <span ${editAttributes(variantEdit('role', 'Role'))}>${escapeHtml(variant.role)}</span></div>
      </div>
      <div class="letter-opening">Dear Hiring Team,</div>
      <div class="letter-body">${paragraphs}</div>
      <footer class="letter-closing">
        <div>Kind regards,</div>
        <img class="letter-signature" src="/frank-signature.svg" alt="Frank">
      </footer>
    </section>
  `;
}

export function VisualResume({ profile, variant, variantKey, metrics }: VisualResumeProps): string {
  const thesis = renderText(variant.thesis, metrics.sectionWidth, 'body', 'lead-copy', variantEdit('thesis', 'Professional summary', 'multiline'));
  const role = renderText(variant.role, metrics.mainWidth, 'title', 'role-line', variantEdit('role', 'Role'));
  const selectedResearch = selectedResearchOutput(profile);
  return `
    <section class="page">
      <header class="resume-hero">
        <div class="hero-name">
          <h1>${visualNameWithPronunciation(profile)}</h1>
          ${role.html}
        </div>
        <div class="hero-meta">
          ${renderContactMeta(profile)}
        </div>
      </header>

      <div class="content-grid">
        <section class="main-col">
          <section class="thesis-block">
            ${thesis.html}
          </section>

          <section class="resume-section">
            <h2>Professional Experience</h2>
            ${variant.work.map((work, index) => renderWork(work, index, metrics, index === 0 ? 3 : 2)).join('')}
          </section>

          <section class="resume-section">
            <h2>Selected Projects</h2>
            <div class="project-grid">
              ${visualProjects(variantKey, variant.projects)
                .map((project) => renderProject(project, variant.projects.indexOf(project), metrics))
                .join('')}
            </div>
          </section>
        </section>

        <aside class="side-col">
          <div class="side-rule"></div>
          ${renderSideBlock('Core Capabilities', variant.skills, metrics, 'skills')}
          ${renderSideBlock('Product Lens', variant.priorities, metrics, 'priorities')}
          <section class="side-section research-section">
            <h2>Research Evidence</h2>
            <div class="publication-list">
              ${selectedResearch
                .map((publication) => renderSidePublication(publication, profile.publications.indexOf(publication), metrics))
                .join('')}
            </div>
          </section>
          ${renderEducationBlock(profile.education, metrics)}
          ${renderSideBlock('Working Style', profile.workingStyle, metrics, 'profile.workingStyle', 'shared')}
          ${renderSideBlock('Toolbox', profile.toolbox, metrics, 'profile.toolbox', 'shared')}
          ${renderSideBlock('Focus Areas', profile.focusAreas, metrics, 'profile.focusAreas', 'shared')}
        </aside>
      </div>
    </section>
  `;
}
