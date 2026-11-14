/**
 * Compatibility redirect for historical bookmarks.
 *
 * The editor implementation now lives at /tools/sprite-editor. The original
 * IndexedDB project ID is forwarded unchanged; no migration or deletion occurs.
 */
import { redirect } from 'next/navigation';

export default async function LegacyPixelatorRoute({
  searchParams,
}: {
  searchParams: Promise<{ project?: string | string[] }>;
}) {
  const params = await searchParams;
  const project = Array.isArray(params.project) ? params.project[0] : params.project;
  const destination = project
    ? `/tools/sprite-editor?project=${encodeURIComponent(project)}`
    : '/tools/sprite-editor';
  redirect(destination);
}
