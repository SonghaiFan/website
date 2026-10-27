import type { EditKind, EditMeta, Profile, Variant } from '../types';
import { selectedResearchOutput } from '../data/resume';
import { editAttributes } from '../editor/markup';
import { escapeHtml } from '../utils/html';
import './AtsResume.css';

type AtsResumeProps = {
  profile: Profile;
  variant: Variant;
};

export function wrapAtsPage(pageHtml: string): string {
  return `<div class="page-shell ats-shell">${pageHtml}</div>`;
}

function sharedEdit(path: string, label: string, kind: EditKind = 'single'): EditMeta {
  return { path, label, kind, scope: 'shared' };
}

function variantEdit(path: string, label: string, kind: EditKind = 'single'): EditMeta {
  return { path: `variant.${path}`, label, kind, scope: 'variant' };
}

function atsList(items: string[], edit?: { basePath: string; label: string; scope: EditMeta['scope'] }): string {
  return `<ul>${items
    .map((item, index) => {
      const meta = edit
        ? {
            path: `${edit.scope === 'variant' ? 'variant.' : ''}${edit.basePath}.${index}`,
            label: `${edit.label} ${index + 1}`,
            kind: 'multiline' as const,
            scope: edit.scope
          }
        : undefined;
      return `<li ${editAttributes(meta)}>${escapeHtml(item)}</li>`;
    })
    .join('')}</ul>`;
}

export function AtsCoverLetter({ profile, variant }: AtsResumeProps): string {
  const dateString = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return `
    <section class="page ats-page ats-letter-page">
      <header class="ats-header">
        <h1 ${editAttributes(sharedEdit('profile.name', 'Name'))}>${escapeHtml(profile.name)}</h1>
        <p>
          <span ${editAttributes(sharedEdit('profile.email', 'Email'))}>${escapeHtml(profile.email)}</span> |
          <span ${editAttributes(sharedEdit('profile.phone', 'Phone'))}>${escapeHtml(profile.phone)}</span> |
          <span ${editAttributes(sharedEdit('profile.location', 'Location'))}>${escapeHtml(profile.location)}</span> |
          ${profile.links
            .map((link, index) => `<span ${editAttributes(sharedEdit(`profile.links.${index}`, `Link ${index + 1}`))}>${escapeHtml(link)}</span>`)
            .join(' | ')}
        </p>
      </header>
      <p class="ats-date">${escapeHtml(dateString)}</p>
      <p>Hiring Team<br>Re: <span ${editAttributes(variantEdit('role', 'Role'))}>${escapeHtml(variant.role)}</span></p>
      <p>Dear Hiring Team,</p>
      ${variant.letter
        .map((paragraph, index) => `<p ${editAttributes(variantEdit(`letter.${index}`, `Cover letter paragraph ${index + 1}`, 'multiline'))}>${escapeHtml(paragraph)}</p>`)
        .join('')}
      <p>Kind regards,<br>Frank</p>
    </section>
  `;
}

export function AtsResume({ profile, variant }: AtsResumeProps): string {
  return `
    <section class="page ats-page">
      <header class="ats-header">
        <h1><span ${editAttributes(sharedEdit('profile.name', 'Name'))}>${escapeHtml(profile.name)}</span> “<span ${editAttributes(sharedEdit('profile.aka', 'Preferred name'))}>${escapeHtml(profile.aka)}</span>”</h1>
        <p ${editAttributes(variantEdit('role', 'Role'))}>${escapeHtml(variant.role)}</p>
        <p>
          <span ${editAttributes(sharedEdit('profile.email', 'Email'))}>${escapeHtml(profile.email)}</span> |
          <span ${editAttributes(sharedEdit('profile.phone', 'Phone'))}>${escapeHtml(profile.phone)}</span> |
          <span ${editAttributes(sharedEdit('profile.location', 'Location'))}>${escapeHtml(profile.location)}</span> |
          ${profile.links
            .map((link, index) => `<span ${editAttributes(sharedEdit(`profile.links.${index}`, `Link ${index + 1}`))}>${escapeHtml(link)}</span>`)
            .join(' | ')}
        </p>
      </header>

      <section class="ats-section">
        <h2>Summary</h2>
        <p ${editAttributes(variantEdit('thesis', 'Professional summary', 'multiline'))}>${escapeHtml(variant.thesis)}</p>
      </section>

      <section class="ats-section">
        <h2>Professional Experience</h2>
        ${variant.work
          .map(
            (work, workIndex) => `
              <article class="ats-item">
                <h3><span ${editAttributes(variantEdit(`work.${workIndex}.role`, 'Experience role'))}>${escapeHtml(work.role)}</span> | <span ${editAttributes(variantEdit(`work.${workIndex}.org`, 'Organisation'))}>${escapeHtml(work.org)}</span> | <span ${editAttributes(variantEdit(`work.${workIndex}.period`, 'Experience period'))}>${escapeHtml(work.period)}</span></h3>
                ${atsList(work.points, { basePath: `work.${workIndex}.points`, label: 'Experience bullet', scope: 'variant' })}
              </article>
            `
          )
          .join('')}
      </section>

      <section class="ats-section">
        <h2>Selected Projects</h2>
        ${variant.projects
          .map(
            (project, projectIndex) => `
              <article class="ats-item">
                <h3 ${editAttributes(variantEdit(`projects.${projectIndex}.title`, 'Project title'))}>${escapeHtml(project.title)}</h3>
                <p><strong ${editAttributes(variantEdit(`projects.${projectIndex}.meta`, 'Project metadata'))}>${escapeHtml(project.meta)}.</strong> <span ${editAttributes(variantEdit(`projects.${projectIndex}.text`, 'Project description', 'multiline'))}>${escapeHtml(project.text)}</span></p>
                ${project.points ? atsList(project.points, { basePath: `projects.${projectIndex}.points`, label: 'Project proof point', scope: 'variant' }) : ''}
              </article>
            `
          )
          .join('')}
      </section>

      <section class="ats-section">
        <h2>Research Evidence</h2>
        <ul>
          ${selectedResearchOutput(profile)
            .map((publication) => {
              const index = profile.publications.indexOf(publication);
              return `<li><span ${editAttributes(sharedEdit(`profile.publications.${index}.venue`, 'Publication venue'))}>${escapeHtml(publication.venue)}</span> <span ${editAttributes(sharedEdit(`profile.publications.${index}.year`, 'Publication year'))}>${escapeHtml(publication.year)}</span> - <span ${editAttributes(sharedEdit(`profile.publications.${index}.title`, 'Publication title', 'multiline'))}>${escapeHtml(publication.title)}</span></li>`;
            })
            .join('')}
        </ul>
      </section>

      <section class="ats-section">
        <h2>Core Capabilities</h2>
        <p>${variant.skills
          .map((item, index) => `<span ${editAttributes(variantEdit(`skills.${index}`, `Core capability ${index + 1}`, 'multiline'))}>${escapeHtml(item)}</span>`)
          .concat(
            profile.methods.map(
              (item, index) => `<span ${editAttributes(sharedEdit(`profile.methods.${index}`, `Method ${index + 1}`, 'multiline'))}>${escapeHtml(item)}</span>`
            )
          )
          .join('; ')}</p>
      </section>

      <section class="ats-section">
        <h2>Languages</h2>
        <p>${profile.languages
          .map((item, index) => `<span ${editAttributes(sharedEdit(`profile.languages.${index}`, `Language ${index + 1}`))}>${escapeHtml(item)}</span>`)
          .join('; ')}</p>
      </section>

      <section class="ats-section">
        <h2>Education</h2>
        <ul>${profile.education
          .map(
            (item, index) => `<li><span ${editAttributes(sharedEdit(`profile.education.${index}.degree`, 'Education degree', 'multiline'))}>${escapeHtml(item.degree)}</span> - <span ${editAttributes(sharedEdit(`profile.education.${index}.institution`, 'Education institution'))}>${escapeHtml(item.institution)}</span> - <span ${editAttributes(sharedEdit(`profile.education.${index}.period`, 'Education period'))}>${escapeHtml(item.period)}</span>${item.details ? ` - ${item.details.map((detail, detailIndex) => `<span ${editAttributes(sharedEdit(`profile.education.${index}.details.${detailIndex}`, `Education detail ${detailIndex + 1}`, 'multiline'))}>${escapeHtml(detail)}</span>`).join(', ')}` : ''}</li>`
          )
          .join('')}</ul>
      </section>
    </section>
  `;
}
