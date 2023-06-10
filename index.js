const http = require('http');
const https = require('https');
const fs = require('fs');
const querystring = require('querystring');
const credentials = require('./credentials.json');
const api_key = credentials.api_key;

const port = 3000;
const server = http.createServer();

server.on("request", connection_handler);
function connection_handler(req, res){
	console.log(`New Request for ${req.url} from ${req.socket.remoteAddress}`);
	if (req.url === '/'){
		const main = fs.createReadStream('main.html');
		res.writeHead(200, {'Content-Type':'text/html'});
		main.pipe(res);
	}
	else if (req.url.startsWith("/search")){
		const myURL = new URL("localhost:3000"+ req.url);
		const movie = myURL.searchParams.get('movie');
        const city = myURL.searchParams.get('city');
        const state = myURL.searchParams.get('state');

        create_movie_search_request(api_key, movie, city, state, res);
    }	
	else { 
		res.writeHead(404, {'Content-Type':'text/plain'});
		res.end('404 Not Found');
	}
}

server.on("listening", listening_handler);
function listening_handler(){
	console.log(`Now Listening on Port ${port}`);
}

server.listen(port);

function create_movie_search_request(api_key, movie, city, state, res){
	let movie_is_cached = false;
	let movie_results;
	try {
		const movie_cache = require("movies.json");
		movie_cache.forEach(item =>{
			if (item.title.toLowerCase() === movie.toLowerCase()){
				movie_results = item;
				movie_is_cached = true;
			}
		});
	}
	catch {SyntaxError}
	if (movie_is_cached){
		console.log("Movie retrieved from Cache");
		console.log(movie_results);
		create_beer_request(city, state, movie_results, res);
	}
	else {
		const options = {
			method:"GET"
		}
		const search_query = querystring.stringify({query:movie, "api-key":api_key});
		const search_endpoint = `https://api.nytimes.com/svc/movies/v2/reviews/search.json?${search_query}`;
		const search_req = https.request(search_endpoint, options, (search_result_stream) => stream_message(search_result_stream, received_movie_result, city, state, res));
		search_req.once("error", (err)=>{throw err});
		search_req.end();
	}
}

function stream_message(stream, callback, ...args){
	let body = "";
	stream.on("data", (chunk)=>body += chunk);
	stream.on("end", ()=> callback(body, ...args));
}

function received_movie_result(serialized_search_object, city, state, res){
		const search_results = JSON.parse(serialized_search_object);
		const results = {
			"title":search_results.results[0].display_title,
			"summary":search_results.results[0].summary_short
		}
		fs.readFile("movies.json", (err, data)=>{	
			let movies = [];
			try {
				movies.push(...JSON.parse(data));
			}	
			catch {SyntaxError}
			movies.push(results);
			fs.writeFile("movies.json", JSON.stringify(movies, null, 4), ()=>{console.log("Movie Cached Successfully")});
		});
		create_beer_request(city, state, results, res);
}
function create_beer_request(city, state, movie_results, res){
	let beer_is_cached = false;
	let cached_breweries = [];
	try {
		const beer_cache = require("beer.json");
		beer_cache.forEach(item =>{
			if (item.city.toLowerCase() === city.toLowerCase() && item.state.toLowerCase() === state.toLowerCase()){
				cached_breweries.push(item);
				beer_is_cached = true;
			}
		})
	}
	catch {SyntaxError}
	if (beer_is_cached){
		console.log("Breweries retrieved from Cache");
		console.log(cached_breweries);
		generate_webpage(movie_results, cached_breweries, res);
	}
	else {	
		const options = {
			method:"GET"
		}
		const search_query = querystring.stringify({by_city:city, by_state:state});
		const search_endpoint = `https://api.openbrewerydb.org/v1/breweries?${search_query}&per_page=3`;
		const search_req = https.request(search_endpoint, options);
		search_req.once("error", (err)=>{throw err});
		search_req.once("response", search_result_stream => stream_message(search_result_stream, received_beer_result, movie_results, res));
		search_req.end();
	}
}

function received_beer_result(serialized_search_object, movie_results, res){
    const search_results = JSON.parse(serialized_search_object);
    const brewery = search_results.map(brew => ({name:brew.name, city:brew.city, state:brew.state_province}));
	fs.readFile("beer.json", (err, data)=>{
		let beers = [];
		try {
			beers.push(...JSON.parse(data));
		}
		catch {SyntaxError}
			beers.push(...brewery);
			fs.writeFile("beer.json", JSON.stringify(beers, null, 4), ()=>{console.log("Breweries Cached Successsfully")});
	});
	
    generate_webpage(movie_results, brewery, res);
}

function generate_webpage(movie_results, brewery, res){
	if (brewery.length === 0){
		res.writeHead(400, {"Content-Type":"text/html"});
		res.write("400 Bad Location Request");
		res.write('<br><a href="http://localhost:3000">Back to Search</a>');
	}
	else {
		let {title, summary} = movie_results;
		res.writeHead(200, {"Content-Type": "text/html;charset=utf-8"});
		res.write(`<h1>${title}</h1>${summary}`);
		res.write(`<h1>Breweries in ${brewery[0].city}, ${brewery[0].state}:\n</h1>`);
		res.write(`<ol><li>${brewery[0].name}</li><li>${brewery[1].name}</li><li>${brewery[2].name}</li>`);
		res.end(`<br><a href="http://localhost:3000">Back to Search</a>`);
	}
}
