(function(){
	GTA.namespace("GTA.core");
	//constructor
	GTA.core.Loader = function(  ) {
	    this.loading = false;
		return this;
	}


	GTA.core.Loader.prototype.LoadData = function(OnCompleted)
	{
	    var ctx = this;
	    this.loading = true;
		getBinaryData("http://localhost:8000/MP1-comp.gmp", MapLoadComplete);
			
		function MapLoadComplete(data, err)
		{
			var mapData = data.responseText;
			ctx.level = new ReadFromData(mapData);
			
			getBinaryData("http://localhost:8000/bil.sty", StyleLoadComplete);
		}
			
		function StyleLoadComplete(data, err) {
			var styleData = data.responseText;

			if (loadTextures) {
			    ctx.style = ParseStyle(styleData, getTileNumbers(ctx.level));
			}

			level = ctx.level;
			style = ctx.style;

			//Let the world know we are done.
			OnCompleted();
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