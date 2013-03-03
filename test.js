// Load the http module to create an http server.
var http = require('http');

// Configure our HTTP server to respond with Hello World to all requests.
var server = http.createServer(function (request, response) {
	
	var fs = require('fs');
			
	var header;
	var url;
	
	if(request.url == "/client/")
	{
		url = "testClient.html";
		header = "text/html";
	}
	else if(request.url == "/map/")
	{	
		url = "MP1-comp.gmp";
		header = "application/octet-stream; charset=x-user-defined";	
	}
	else {
		url = request.url.substr(1);
		header = "application/javascript";
	}

	fs.readFile(url, function (err, data) {
		
		if (err) {
			console.log("Cold not find file:"+request.url);
		}
		
		//console.log(data);
		response.writeHead(200, {"Content-Type": header});
		response.end(data);			
	});  
});

// Listen on port 8000, IP defaults to 127.0.0.1
server.listen(8000);

// Put a friendly message on the terminal
console.log("Server running at http://127.0.0.1:8000/");

