

(function(){
	GTA.namespace("GTA.Model");
	//constructor
	GTA.Model.EntityState = function(  ) {

		this.position = new GTA.Model.Point();

		return this;
	};

	GTA.Model.EntityState.prototype.toJson = function()
	{
		return {position:this.position};
	}
	
	GTA.Model.EntityState.prototype.fromJson = function(json)
	{
		this.position = json.position;
	}


	//Get as delta compressed string

})();