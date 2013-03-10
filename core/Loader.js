var level;
var style;
(function(){
	GTA.namespace("GTA.core");
	//constructor
	GTA.core.Loader = function(  ) {

		this.loading = false;
		return this;
	}


	GTA.core.Loader.prototype.LoadData = function(OnCompleted)
	{	this.loading = true;
		console.log("load all the data");

		

	    
		
		 style = new Object();
			
		style.tiles = new Array();
		style.tiles[0] = new Image();
		
		var dummyTexture = new Image();
	
	//dummyTexture.onload = function () 
	{
	
	
		if(!loadTextures) {
			for(i = 0;i < 1024;i++) {
				style.tiles[i] = dummyTexture;
			}
		}
	
		//$(function () {
		    $("#statusmessage").text("Downloading map...");
			$("#progressbarContent").css("width", "10%");		
			
			var startDate = new Date();
         
			getBinaryData("http://localhost:8000/MP1-comp.gmp", LoadComplete);
			
			function LoadComplete(data, err)
			{
				
				$("#statusmessage").text("Parsing map...");
				$("#progressbarContent").css("width", "20%");
			
				var mapData = data.responseText;
				level = new ReadFromData(mapData);
				
				$("#statusmessage").text("Downloading styles...");
				$("#progressbarContent").css("width", "30%");
				
				getBinaryData("http://localhost:8000/bil.sty", StyleLoadComplete);
			}
			
			function StyleLoadComplete(data, err) {
				var styleData = data.responseText;
				console.log("Parsing styles...");
				$("#statusmessage").html("Parsing styles...");
				$("#progressbarContent").css("width", "50%");
				
				setTimeout(function(){
					if(loadTextures) {
						style = ParseStyle(styleData, getTileNumbers(level));
					}   
						
					$("#statusmessage").text("Initalizing game...");
					$("#progressbarContent").css("width", "80%");
						
					setTimeout(function(){
						
                        
						$("#loadingScreen").hide();
							
						var endDate = new Date();
							
						console.log("Loaded in "+(endDate.getTime()-startDate.getTime())/1000+"sec");

						//Let the world know we are done.
						OnCompleted();
						
						//animate();
					},10);
				},10);
				
			}
		//});
		
	};
	
	dummyTexture.src = "http://localhost:8000/texture.jpg";

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