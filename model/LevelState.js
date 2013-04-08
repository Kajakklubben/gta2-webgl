// We should create one of this for each from to send the data.
// It should have a delta function for compression

(function(){
	GTA.namespace("GTA.Model");
	//constructor
	GTA.Model.LevelState = function(  ) {

		// Ask each entity to create it's EntityDescriptionString
		this.staticObjects = [];
		this.dynamicObjects = [];
		this.players = [];

		return this;
	};

	GTA.Model.LevelState.prototype.toJson = function()
	{
		var json = {players:[]};
		for(var i in this.players)
		{
			json.players.push(this.players[i].toJson());
		}
		return json;
	}
	
	

	GTA.Model.LevelState.prototype.fromJson = function(json)
	{
		for(var i in this.players)
		{
			this.players[i].fromJson(json.players[i]);
		}
	}

	//Get as delta compressed string

})();