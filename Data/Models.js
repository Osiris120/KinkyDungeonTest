"use strict";


let KDCanvasRenderMap = new Map();
KDCanvasRenderMap.set(KinkyDungeonCanvasPlayer, "temp");

/**
 * Returns a table with the priorities for each layer based on order of the array
 * @param {string[]} layers
 * @returns {Record<string, number>}
 */
function InitLayers(layers) {
	/** @type {Record<string, number>} */
	let table = {};
	let count = 0;
	for (let l of layers) {
		table[l] = count * LAYER_INCREMENT;
		count += 1;
	}
	return table;
}
let ModelLayers = InitLayers(LAYERS_BASE);


/** @type {Record<string, Model>} */
let ModelDefs = {};
/**
 * @param {Model} Model
 */
function AddModel(Model) {
	ModelDefs[Model.Name] = Model;
}

/** @type {Map<Character, ModelContainer>} */
let KDCurrentModels = new Map();

class ModelContainer {
	/**
	 * @param {Character} Character
	 * @param {Map<string, Model>} Models
	 * @param {any} Container
	 * @param {Map<string, any>} SpriteList
	 * @param {Map<string, any>} SpritesDrawn
	 * @param {Record<string, boolean>} Poses
	 */
	constructor(Character, Models, Container, SpriteList, SpritesDrawn, Poses) {
		this.Character = Character;
		this.Container = Container;
		this.SpriteList = SpriteList;
		this.SpritesDrawn = SpritesDrawn;
		this.Models = Models;
		this.Poses = Poses;
	}

	/**
	 * Adds a model to the modelcontainer
	 * @param {Model} Model
	 */
	addModel(Model) {
		this.Models.set(Model.Name, Model);
	}
	/**
	 * Deletes a model to the modelcontainer
	 * @param {string} Model
	 */
	removeModel(Model) {
		this.Models.delete(Model);
	}
}

/**
 * @param {ModelLayer[]} Layers
 * @returns {Record<string, ModelLayer>}
 */
function ToLayerMap(Layers) {
	return ToNamedMap(Layers);
}


/**
 * Refreshes the character if not all images are loaded and draw the character canvas on the main game screen
 * @param {Character} C - Character to draw
 * @param {number} X - Position of the character on the X axis
 * @param {number} Y - Position of the character on the Y axis
 * @param {number} Zoom - Zoom factor
 * @param {boolean} [IsHeightResizeAllowed=true] - Whether or not the settings allow for the height modifier to be applied
 * @param {CanvasRenderingContext2D} [DrawCanvas] - The canvas to draw to; If undefined `MainCanvas` is used
 * @param {any} [Blend] - The blend mode to use
 * @param {PoseMod[]} [StartMods] - Mods applied
 * @returns {void} - Nothing
 */
function DrawCharacter(C, X, Y, Zoom, IsHeightResizeAllowed, DrawCanvas, Blend = PIXI.settings.SCALE_MODE = PIXI.SCALE_MODES.LINEAR, StartMods = []) {
	/** @type {ModelContainer} */
	let MC = !KDCurrentModels.get(C) ? new ModelContainer(
		C,
		new Map(),
		new PIXI.Container(),
		new Map(),
		new Map(),
		{
			Free: true,
			Spread: true,
		},
	) : KDCurrentModels.get(C);


	MC.SpritesDrawn.clear();

	// TODO remove test code
	MC.addModel(ModelDefs.Body);
	//MC.addModel(ModelDefs.Catsuit);

	// Actual loop for drawing the models on the character
	DrawCharacterModels(MC, X + Zoom * MODEL_SCALE * MODELWIDTH/2, Y + Zoom * MODEL_SCALE * MODELHEIGHT/2, (Zoom * MODEL_SCALE) || MODEL_SCALE, StartMods);

	// Cull sprites that weren't drawn yet
	for (let sprite of MC.SpriteList.entries()) {
		if (!MC.SpritesDrawn.has(sprite[0]) && sprite[1] && sprite[1].parent == MC.Container) {
			sprite[1].parent.removeChild(sprite[1]);
			MC.SpriteList.delete(sprite[0]);
			sprite[1].destroy();
		}
	}

	// Render the container, committing its image to the screen
	let renderer = DrawCanvas ? (KDCanvasRenderMap.get(DrawCanvas.canvas) || pixirenderer) : pixirenderer;

	if (renderer == "temp") {
		let view = DrawCanvas.canvas;
		renderer = new PIXI.CanvasRenderer({
			// @ts-ignore
			width: view.width,
			// @ts-ignore
			height: view.height,
			view: view,
			antialias: true,
		});
		KDCanvasRenderMap.set(DrawCanvas.canvas, renderer);
	}

	if (renderer) {
		// We always draw with the nice linear scaling
		let sm = PIXI.settings.SCALE_MODE;
		PIXI.settings.SCALE_MODE = Blend;
		renderer.render(MC.Container, {
			clear: false,
		});
		PIXI.settings.SCALE_MODE = sm;
	}

	// Store it in the map so we don't have to create it again
	if (!KDCurrentModels.get(C)) {
		MC.Container.sortableChildren = true;
		KDCurrentModels.set(C, MC);
	}
}
/** Future function */
let DrawModel = DrawCharacter;

/**
 * Setup sprites from the modelcontainer
 * @param {ModelContainer} MC
 */
function DrawCharacterModels(MC, X, Y, Zoom, StartMods) {
	// We create a list of models to be added
	let Models = new Map(MC.Models.entries());

	// TODO hide, filtering based on pose, etc etc
	let {X_Offset, Y_Offset} = ModelGetPoseOffsets(MC.Poses);
	let {rotation, X_Anchor, Y_Anchor} = ModelGetPoseRotation(MC.Poses);
	let mods = ModelGetPoseMods(MC.Poses);
	MC.Container.angle = rotation;
	MC.Container.pivot.x = MODELWIDTH*Zoom * X_Anchor;
	MC.Container.pivot.y = MODELHEIGHT*Zoom * Y_Anchor;
	MC.Container.x = X + (MODEL_XOFFSET + MODELWIDTH * X_Offset) * Zoom;
	MC.Container.y = Y + (MODELHEIGHT * Y_Offset) * Zoom;

	for (let m of StartMods) {
		if (!mods[m.Layer]) mods[m.Layer] = [];
		mods[m.Layer].push(m);
	}


	// Now that we have the final list of models we do a KDDraw
	for (let m of Models.values()) {
		for (let l of Object.values(m.Layers)) {
			if (ModelDrawLayer(m, l, MC.Poses)) {
				let ox = 0;
				let oy = 0;
				let ax = 0;
				let ay = 0;
				let sx = 1;
				let sy = 1;
				let rot = 0;
				let layer = l.Layer;
				while (layer) {
					/** @type {PoseMod[]} */
					let mod_selected = mods[layer] || [];
					for (let mod of mod_selected) {
						ox = mod.offset_x || ox;
						oy = mod.offset_y || oy;
						ax = mod.rotation_x_anchor || ax;
						ay = mod.rotation_y_anchor || ay;
						sx *= mod.scale_x || 1;
						sy *= mod.scale_y || 1;
						rot += mod.rotation || 0;
					}
					layer = LayerProperties[layer]?.Parent;
				}

				KDDraw(
					MC.Container,
					MC.SpriteList,
					`layer_${m.Name}_${l.Name}`,
					ModelLayerString(m, l, MC.Poses),
					ox * MODELWIDTH * Zoom, oy * MODELHEIGHT * Zoom, undefined, undefined,
					rot * Math.PI / 180, {
						zIndex: -ModelLayers[l.Layer] + (l.Pri || 0),
						anchorx: ax,
						anchory: ay,
						scalex: sx != 1 ? sx : undefined,
						scaley: sy != 1 ? sy : undefined,
					}, false,
					MC.SpritesDrawn,
					Zoom
				);
			}
		}
	}
}

/**
 * Determines if we should draw this layer or not
 * @param {Model} Model
 * @param {ModelLayer} Layer
 * @param {Record<string, boolean>} Poses
 * @returns {boolean}
 */
function ModelDrawLayer(Model, Layer, Poses) {
	// Filter poses
	if (Layer.Poses) {
		let found = false;
		for (let p of Object.keys(Poses)) {
			if (Layer.Poses[p]) {
				found = true;
				break;
			}
		}
		if (!found) return false;
	}
	// TODO filter hide
	return true;
}

/**
 *
 * @param {Model} Model
 * @param {ModelLayer} Layer
 * @param {Record<string, boolean>} Poses
 * @returns {string}
 */
function ModelLayerString(Model, Layer, Poses) {
	return `Data/Models/${Model.Folder}/${LayerSprite(Layer, Poses)}.png`;
}

/**
 * Gets the sprite name for a layer for a given pose
 * @param {ModelLayer} Layer
 * @param {Record<string, boolean>} Poses
 * @returns {string}
 */
function LayerSprite(Layer, Poses) {
	let pose = "";
	let foundPose = false;

	// change the pose if its a morph pose, this helps to avoid duplication
	let cancel = false;
	if (Layer.MorphPoses) {
		for (let dp of Object.entries(Layer.MorphPoses)) {
			if (Poses[dp[0]] != undefined) {
				pose = dp[1];
				cancel = true;
				foundPose = true;
				break;
			}
		}
	}
	// Handle the actual poses
	if (Layer.Poses && !cancel) {
		// Otherwise we append pose name to layer name
		for (let p of Object.keys(Layer.Poses)) {
			if (Poses[p] != undefined) {
				pose =
					(
						(
							!(Layer.GlobalDefaultOverride && Layer.GlobalDefaultOverride[p])
							&& PoseProperties[p])
								? PoseProperties[p].global_default
								: p)
					|| p;
				foundPose = true;
				break;
			}
		}
	}

	// For simplicity, we can have a global default override and it will add it as a pose to the list
	// This helps simplify definitions, like for hogtie
	if (!foundPose && !cancel && Layer.GlobalDefaultOverride) {
		for (let p of Object.keys(Layer.GlobalDefaultOverride)) {
			if (Poses[p] != undefined) {
				pose = p;
				break;
			}
		}
	}

	if (Layer.AppendPose) {
		for (let p of Object.keys(Layer.AppendPose)) {
			if (Poses[p] != undefined && (!Layer.AppendPoseRequire || Layer.AppendPoseRequire[p])) {
				pose = pose + p;
				break;
			}
		}
	}

	return (Layer.Sprite ? Layer.Sprite : Layer.Name) + pose;
}