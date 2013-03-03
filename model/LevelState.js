// We should create one of this for each from to send the data.
// It should have a delta function for compression

(function(){
	RealtimeMultiplayerGame.namespace("GTA.model");
	//constructor
	GTA.model.LevelState = function(  ) {

		// Ask each entity to create it's EntityDescriptionString
		this.staticObjects = [];
		this.dynamicObjects = [];
		this.players = [];

		return this;
	};


	//Get as delta encoded string

})();