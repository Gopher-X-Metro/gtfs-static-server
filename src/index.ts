/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */
import { createClient } from '@supabase/supabase-js';

interface Env {
	SUPABASE_URL: string;
	SUPABASE_ANON_KEY: string;
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const { pathname, searchParams } = new URL(request.url);
		
		const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

		if (pathname.startsWith('/api/')) {
			if (pathname === '/api/database-refresh' && request.method === 'POST') {
				return await handlePostDatabaseRefresh(supabase);
			}
			// ... other routes and methods
			else {
				return new Response('Not Found!', { status: 404 });
			}
		}

		return new Response('Hello World!');
	},
} satisfies ExportedHandler<Env>;

async function handlePostDatabaseRefresh(supabase: ReturnType<typeof createClient>): Promise<Response> {
	const { data, error } = await supabase.from('routes').select();
  
	if (error) {
	  return new Response(JSON.stringify({ error: error.message }), {
		status: 500,
		headers: { 'Content-Type': 'application/json' },
	  });
	}
  
	return new Response(JSON.stringify(data), {
	  headers: { 'Content-Type': 'application/json' },
	});
}