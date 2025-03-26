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
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import JSZip from 'jszip'

interface Env {
	SUPABASE_URL: string;
	SUPABASE_ANON_KEY: string;
}

export default {
	async scheduled(controller, env, ctx) {
		console.log("cron processed");
	},
	async fetch(request, env, ctx): Promise<Response> {
		const { pathname, searchParams } = new URL(request.url);
		
		const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

		if (pathname.startsWith('/api/')) {
			if (pathname === '/api/database-refresh' && request.method === 'POST') {
				const { data, error } = await supabase.auth.signInWithPassword({
					email: 'hwvxyeej@gmail.com',
					password: 'Kamenrider',
				})
		
				if (error) {
					console.error("Error signing in:", error.message);
				} else {
					console.log("Sign in successful:", data.user.email);
				}

				return await handlePostDatabaseRefresh(supabase);
			}
			else {
				return new Response('Not Found!', { status: 404 });
			}
		}

		return new Response('Hello World!');
	},
} satisfies ExportedHandler<Env>;

const dataPacketSize = 1000;

async function uploadProcessedData(supabase : SupabaseClient<any, "public", any>, processed : {}[] | undefined, bulkSize : number, table : string) {
	while (processed && processed?.length > 0) {
		const dataUpload = processed.splice(0, bulkSize);
		const { data, error } = await supabase
		.from(table)
		.insert(dataUpload).select()
		
		if (error) {
			console.error("Error inserting in:", error.message);
		} else {
			console.log("Inserting in successful:", data.length);
		}
	}
}

async function handlePostDatabaseRefresh(supabase : SupabaseClient<any, "public", any>): Promise<Response> {
	const zip = await fetch("https://svc.metrotransit.org/mtgtfs/gtfs.zip")
	.then(response => response.arrayBuffer()
	.then(arrayBuffer => JSZip.loadAsync(arrayBuffer)
	.then(zip => zip)));

	const routesFile = zip.file("routes.txt");
	const tripsFile = zip.file("trips.txt");
	const shapesFile = zip.file("shapes.txt");

	let fileContents, processed;

	console.log("Uploading shapes");
	fileContents = await shapesFile?.async("string");
	processed = fileContents?.split(/\r\n/).filter(n=>n).slice(1).map(line => {
		const separated = line.split(/,/);
		return {shape_id: separated[0], shape_pt_lat: separated[1], shape_pt_lon: separated[2], shape_pt_sequence: separated[3], shape_dist_traveled: separated[4]}
	})
	await uploadProcessedData(supabase, processed, 1000, "shapes");

	console.log("Uploading routes")
	fileContents = await routesFile?.async("string");
	processed = fileContents?.split(/\r\n/).filter(n=>n).slice(1).map(line => {
		const separated = line.split(/,/);
		return {route_id: separated[0], route_short_name: separated[2], route_long_name: separated[3], route_color: separated[7], route_sort_order: separated[9]}
	})
	await uploadProcessedData(supabase, processed, 1000, "routes");

	console.log("Uploading trips")
	fileContents = await tripsFile?.async("string");
	processed = fileContents?.split(/\r\n/).filter(n=>n).slice(1).map(line => {
		const separated = line.split(/,/);
		return {trip_id: separated[2], route_id: separated[0], shape_id: separated[7], direction_id: separated[4]}
	})
	await uploadProcessedData(supabase, processed, 1000, "trips");
	
	return new Response("Successful Refresh!");
}