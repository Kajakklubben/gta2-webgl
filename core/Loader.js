(function(){
	GTA.namespace("GTA.core");
	//constructor
	GTA.core.Loader = function(  ) {
		
		this.collisionMap = false;
		
	    this.loading = false;
		this.loadingDiv = $("#loadingMessages");

		return this;
	}
	
	
	//--------------------------------------------------
		
	GTA.core.Loader.prototype.ShowMessage = function(msg)
	{
		this.messageStartTime = new Date().getTime();
		
		this.lastDiv = $("<br><div style='float:left;'>"+msg+"</div>");
		this.loadingDiv.append(this.lastDiv);
	}

	GTA.core.Loader.prototype.ShowMessageDone= function()
	{
		var end = new Date().getTime();
		var time = end - this.messageStartTime;
		var seconds = time/1000.0;
		
		this.loadingDiv.append("<div style='float:right; color:green; font-weight:norma; margin-right:0px;'><b>Done</b> "+seconds.toFixed(1)+"sec</div>");
	}

	GTA.core.Loader.prototype.ShowAdditionalMessage= function(msg)
	{
		this.lastDiv.append("<br><span style='font-style:italic; margin-left:20px'>msg</i>");
	}


	//--------------------------------------------------

	GTA.core.Loader.prototype.LoadData = function(OnCompleted)
	{
		this.ShowMessage("Loading Map data");
		
	    var ctx = this;
	    this.loading = true;
		getBinaryData("http://localhost:8000/MP1-comp.gmp", MapLoadComplete);
			
		function MapLoadComplete(data, err)
		{	
			ctx.ShowMessageDone(); //Loading map data
			
			var mapData = data.responseText;
			ctx.level = new ReadFromData(mapData);
			
			ctx.ShowMessage("Loading Style data");
			
			getBinaryData("http://localhost:8000/bil.sty", StyleLoadComplete);
		}
			
		function StyleLoadComplete(data, err) {
			ctx.ShowMessageDone(); //Loading style data
			
			var styleData = data.responseText;

			ctx.ShowMessage("Parsing Style data");

			setTimeout(function(){
				if (loadTextures) {
				    ctx.style = ParseStyle(styleData, getTileNumbers(ctx.level));
				}
			
				level = ctx.level;
				style = ctx.style;
				
				ctx.ShowMessageDone(); // Parsing style data
				
				StyleParseComplete();
			},10);
		}

		function StyleParseComplete() {
            
			ctx.ShowMessage("Creating Collision Map");				
			
			ctx.mapCollision = new GTA.core.CollisionMap();
            ctx.mapCollision.InterpretMapData(level.map);  //level.map is some global variable the fox told me
			
			ctx.ShowMessageDone(); // Interpretting Collision Map

			
			ctx.ShowMessage("Loading OpenGL Scene...");				

			setTimeout(function(){
				//Let the world know we are done.
				OnCompleted();
					
				ctx.ShowMessageDone(); // 
					
				setTimeout(function(){
					ctx.loadingDiv.fadeOut(200);
				}, 1500);
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
		
}
})();