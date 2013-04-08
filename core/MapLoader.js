(function(){
	GTA.namespace("GTA.Core");
	//constructor
	GTA.Core.MapLoader = function(  ) {
		
		this.collisionMap = false;
		this.level = false;
		this.style = false;
		
	    this.loading = false;
			
		return this;
	}
	

	//--------------------------------------------------

	GTA.Core.MapLoader.prototype.LoadData = function(loadStyle, OnCompleted)
	{
		statusview.ShowMessage("Reading settings");				
		
		if(typeof drawLevelArea != 'undefined'){
			statusview.ShowAdditionalLoadingMessage("Draw Level Area Origin: "+drawLevelArea[1]+","+drawLevelArea[0]);						
			statusview.ShowAdditionalLoadingMessage("Draw Level Area Size: "+(drawLevelArea[3]-drawLevelArea[1])+"x"+(drawLevelArea[2]-drawLevelArea[0]));						
			statusview.ShowAdditionalLoadingMessage("Start Cam Position: "+startCamPosition[0]+","+startCamPosition[1]);						
			statusview.ShowAdditionalLoadingMessage("Load Textures: "+loadTextures);						
			statusview.ShowAdditionalLoadingMessage("Use Local Cached Style Tiles: "+useLocalCachedStyleTiles);						
		}

		statusview.ShowMessage("Loading Map data");
		
	    var ctx = this;
	    this.loading = true;
		getBinaryData("http://localhost:8000/","MP1-comp.gmp", MapLoadComplete);
			
		function MapLoadComplete(data, err, littleEndian)
		{	
			statusview.ShowMessageDone(); //Loading map data
			
			var mapData = data;
			
			ctx.level = new GTA.Core.MapParser();
			ctx.level.ReadFromData(mapData, littleEndian);
			
			statusview.ShowMessage("Creating Collision Map");				
			
			ctx.collisionMap = new GTA.Core.CollisionMap();
            ctx.collisionMap.InterpretMapData(ctx.level.map);  //level.map is some global variable the fox told me
		
			statusview.ShowMessageDone(); //Loading map data
		
			if(loadStyle){
				statusview.ShowMessage("Loading Style data");
			
				getBinaryData("http://localhost:8000/","bil.sty", StyleLoadComplete);
			} else {
				
				OnCompleted();
				
			}
		}
			
		function StyleLoadComplete(data, err, littleEndian) {
			statusview.ShowMessageDone(); //Loading style data
			
			var styleData = data;

			statusview.ShowMessage("Parsing Style data");

			setTimeout(function(){
				if (loadTextures) {
					styleParser = new GTA.Core.StyleParser();
					
				    ctx.style = styleParser.ParseStyle(styleData, getTileNumbers(ctx.level));
				} else {
					statusview.ShowAdditionalLoadingMessage("Loading without textures.")
				}
			
				level = ctx.level;
				style = ctx.style;
				
				statusview.ShowMessageDone(); // Parsing style data
				
				StyleParseComplete();
			},10);
		}

		function StyleParseComplete() {
            
			
			statusview.ShowMessageDone(); // Interpretting Collision Map

			
			statusview.ShowMessage("Loading OpenGL Scene...");				

			setTimeout(function(){
				//Let the world know we are done.
				OnCompleted();
					
				statusview.ShowMessageDone(); // 
					
				setTimeout(function(){
					statusview.HideView();
				}, 2500);
			},10);
		}
		
		function getTileNumbers(level) {
		    //Find unique tileNumbers (for selective loading)
		    var uniqueTileNumbers = [];
		    if (level) {
		        var temp = {};
		        for (var i = drawLevelArea[1]; i < drawLevelArea[3]; i++) {
		            for (var ii = drawLevelArea[0]; ii < drawLevelArea[2]; ii++) {
		                for (var iii = 0; iii < level.map[i][ii].length; iii++) {
		                    if (level.map[i][ii][iii] != undefined) {
		                        temp[level.map[i][ii][iii].Top.tileNumber] = true;
		                        temp[level.map[i][ii][iii].Left.tileNumber] = true;
		                        temp[level.map[i][ii][iii].Right.tileNumber] = true;
		                        temp[level.map[i][ii][iii].Bottom.tileNumber] = true;
		                        temp[level.map[i][ii][iii].Lid.tileNumber] = true;
		                    }
		                }
		            }
		        }

		        for (var k in temp)
		            uniqueTileNumbers.push(parseInt(k));
		    }

		    return uniqueTileNumbers;

		}
		
		function getXHR() {
		    var xhr;
		    try {
		        xhr = new XMLHttpRequest();
		    } catch (e) {
		        try {
		            xhr = new ActiveXObject("MSXML2.XMLHTTP.6.0");
		        } catch (e2) {
		            try {
		                xhr = new ActiveXObject("MSXML2.XMLHTTP");
		            } catch (e3) { }
		        }
		    }			
		    return xhr;
    
		}

		function getBinaryData (host, file, callback) {
		    var xhr = getXHR();
		
			if(xhr != undefined) //Client implementation
			{
			    xhr.open("GET", host+file, !!callback);
			    if (callback) {
			        xhr.onload = function () { callback(xhr.responseText, true, true) };
			        xhr.onerror = function () { callback(xhr.responseText, false, true) };
			    }
			    xhr.send();

			    if (typeof callback == "function") {
			        return undefined;
			    } else {
			        return xhr.responseText;
			    }
			}
			else  //Node.js server implementation
			{
				var fs = require('fs');
				var Buffer = require('buffer').Buffer;
				// var constants = require('constants');

				fs.readFile("../"+file,function(err, data) {
				    if (err) {
						console.log("Failed loading binary file");
				        console.log(err.message);
						callback(data, false, true) ;				    
					}
					callback(data, true, true);
				});
				
				return undefined;
				
				
			}
		}
		
}
})();