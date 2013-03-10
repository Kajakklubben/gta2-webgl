// Load the http module to create an http server.
var http = require('http');

var server = http.createServer(function (request, response) {
	
	var fs = require('fs');
			
	var header;
	var url;
	var ext = request.url.split('.').pop();
	var root = '../';
	if(ext == "gmp" || ext == "sty") {
		console.log("gmp");
		url = root+request.url.substr(1);
		header = "application/octet-stream; charset=x-user-defined";	
	}
	else if(ext == "htm" || ext == "html") {
		url = root+request.url.substr(1);
		header = "text/html";
	}
	else if(ext == "jpg") {
		url = root+request.url.substr(1);
		header = "image/jpeg";
	}
	else if(ext == "png") {
		url = root+request.url.substr(1);
		header = "image/jpeg";
	}
	else if (ext == "appcache") {
	    url = root+request.url.substr(1);
	    header = "text/cache-manifest";
	}
	else if (ext == "js") {
		url = root+request.url.substr(1);
		console.log(url);
		header = "application/javascript";
	}
	else {
		url = "../client/index.html";
		header = "text/html";
	}

	fs.readFile(url, function (err, data) {
		
		if (err) {
			console.log("Cold not find file:"+request.url);
		}
		
		response.writeHead(200, {"Content-Type": header});
		response.end(data);			
	});  
});

// Listen on port 8000, IP defaults to 127.0.0.1
server.listen(8000);

// Put a friendly message on the terminal
console.log("Server running at http://127.0.0.1:8000/");

