

(function(){
	GTA.namespace("GTA.model");
	//constructor
	GTA.model.EntityState = function(  ) {

		this.position = new GTA.model.Point();

		return this;
	};

	GTA.model.EntityState.prototype.toJson = function()
	{
		return {position:this.position};
	}
	
	GTA.model.EntityState.prototype.fromJson = function(json)
	{
		this.position = json.position;
	}


	//Get as delta compressed string

})();