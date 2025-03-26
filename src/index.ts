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
	EMAIL: string;
	PASSWORD: string;
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
					email: env.EMAIL,
					password: env.PASSWORD,
				})
		
				if (error) {
					console.error("Error signing in:", error.message);
				} else {
					console.log("Sign in successful:", data.user.email);
				}

				return await handlePostDatabaseRefresh(supabase);
			}
			else if (pathname === '/api/get-trips' && request.method === 'GET') {
				return handleGetTrips(supabase, searchParams);
			}
			else if (pathname === '/api/get-shapes' && request.method === 'GET') {
				return handleGetShapes(supabase, searchParams);
			}
			else {
				return new Response('Not Found!', { status: 404 });
			}
		}

		return new Response('Hello World!');
	},
} satisfies ExportedHandler<Env>;

async function truncateTable(supabase : SupabaseClient<any, "public", any>, tableName : string) {
	const { error } = await supabase.rpc('truncate_table', { table_name: tableName });
  
	if (error) {
	  console.error(`Error truncating table ${tableName}:`, error);
	} else {
	  console.log(`Table ${tableName} truncated successfully.`);
	}
}

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
	const dataPacketSize = 1000;

	const zip = await fetch("https://svc.metrotransit.org/mtgtfs/gtfs.zip")
	.then(response => response.arrayBuffer()
	.then(arrayBuffer => JSZip.loadAsync(arrayBuffer)
	.then(zip => zip)));

	const routesFile = zip.file("routes.txt");
	const tripsFile = zip.file("trips.txt");
	const shapesFile = zip.file("shapes.txt");

	let fileContents, processed;

	console.log("Uploading routes")
	truncateTable(supabase, 'routes');
	fileContents = await routesFile?.async("string");
	processed = fileContents?.split(/\r\n/).filter(n=>n).slice(1).map(line => {
		const separated = line.split(/,/);
		return {route_id: separated[0], route_short_name: separated[2], route_long_name: separated[3], route_color: separated[7], route_sort_order: separated[9]}
	})
	await uploadProcessedData(supabase, processed, dataPacketSize, "routes");

	console.log("Uploading trips")
	truncateTable(supabase, 'trips');
	fileContents = await tripsFile?.async("string");
	processed = fileContents?.split(/\r\n/).filter(n=>n).slice(1).map(line => {
		const separated = line.split(/,/);
		return {trip_id: separated[2], route_id: separated[0], shape_id: separated[7], direction_id: separated[4]}
	})
	await uploadProcessedData(supabase, processed, dataPacketSize, "trips");

	console.log("Uploading shapes");
	truncateTable(supabase, 'shapes');
	fileContents = await shapesFile?.async("string");
	processed = fileContents?.split(/\r\n/).filter(n=>n).slice(1).map(line => {
		const separated = line.split(/,/);
		return {shape_id: separated[0], shape_pt_lat: separated[1], shape_pt_lon: separated[2], shape_pt_sequence: separated[3], shape_dist_traveled: separated[4]}
	})
	await uploadProcessedData(supabase, processed, dataPacketSize, "shapes");
	
	return new Response("Successful Refresh!");
}

async function handleGetTrips(supabase : SupabaseClient<any, "public", any>, searchParams : URLSearchParams): Promise<Response> {
	const route_id = searchParams.get("route_id");
	if (route_id === null) {
		return new Response(JSON.stringify({ error: "missing route_id" }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' },
		});
	}
	
	const { data, error } = await supabase
	.from('trips')
	.select('*')
	.eq('route_id', route_id);

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


async function handleGetShapes(supabase : SupabaseClient<any, "public", any>, searchParams : URLSearchParams): Promise<Response> {
	const shape_id = searchParams.get("shape_id");
	if (shape_id === null) {
		return new Response(JSON.stringify({ error: "missing shape_id" }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' },
		});
	}
	
	const { data, error } = await supabase
	.from('shapes')
	.select('*')
	.eq('shape_id', shape_id);

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