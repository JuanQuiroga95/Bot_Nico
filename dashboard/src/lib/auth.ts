import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySession } from './session';
export async function hasSession() {
  const token = (await cookies()).get('nico-session')?.value ?? '';
  return verifySession(token, process.env.DASHBOARD_PASSWORD ?? '');
}
export async function requireDashboardSession() {
  if (!await hasSession()) redirect('/login');
}
export async function canEditLeads() {
  return !!process.env.DASHBOARD_PASSWORD && await hasSession();
}
