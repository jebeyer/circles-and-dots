import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DragControls } from 'three/addons/controls/DragControls.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

const container = document.querySelector('.container');
const canvas    = document.querySelector('.canvas');

const circlesOutput = document.getElementById('numCirclesOutput');
const tableContainer = document.querySelector('#bottom-right-table');
const table1 = document.querySelectorAll('#bottom-right-table td');
window.onload = function() {

	table1[0].textContent = "point";
	table1[1].textContent = "x";
	table1[2].textContent = "y";
	table1[3].textContent = "z";

    for (let i = 0; i < 6; i++) {
        table1[i*4+4].textContent = i+1;
		table1[i*4+5].textContent = 0;
		table1[i*4+6].textContent = 0;
		table1[i*4+7].textContent = 0;
    }
	
	circlesOutput.textContent = 0;
};	

let
sizes,
scene1,
camera1,
renderer,
controls,
dragcontrols,
raycaster,
mouse,
isIntersecting,
baseMesh,
minMouseDownFlag,
mouseDown,
grabbing,
selection;

let offset = new THREE.Vector3();
let dots = [];
let circles = [];
let circleGeoms = [];
let dotGroups = [];
let vertices = [];
let vertexPairs = [];
let edges = [[]];

let circleColor = 0x202020;
let	sphVertexColor1 = 0x5ac3d8;
let	sphVertexColor2 = 0xffc800;
let	sphEdgeColor = 0xd85ac7;
let vertexRadius = 20.4;
let circlesVisible = true;
let circleUpdateFreq = 1;
let graphVisible = false;

const gui = new GUI();

const setScene = () => {

	sizes = {
		width:  container.offsetWidth,
		height: container.offsetHeight
	};

	scene1 = new THREE.Scene();

	camera1 = new THREE.PerspectiveCamera(
		30, 
		sizes.width / sizes.height, 
		1, 
		1000
	);

	renderer = new THREE.WebGLRenderer({
		canvas:     canvas,
		antialias:  false,
		alpha:      true
	});
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

	const light1 = new THREE.AmbientLight( 0xffffbb ); // soft white light
	scene1.add( light1 );
	
	//const light2 = new THREE.HemisphereLight( 0xffffbb, 0x080820, 1 );
	const light2 = new THREE.HemisphereLight( 0x999999, 0x333333, 1);
	scene1.add( light2 );

	raycaster         = new THREE.Raycaster();
	mouse             = new THREE.Vector2();
	isIntersecting    = false;
	minMouseDownFlag  = false;
	mouseDown         = false;
	grabbing          = false;

	setControls();
	setBaseSphere();
	setDots();
	setupDgList();
	setCircles2();
	setGraph();
	resize();
	listenTo();
	render();
  
}

const setControls = () => {

	controls                 = new OrbitControls(camera1, renderer.domElement);
	controls.autoRotate      = false;
	controls.autoRotateSpeed = 1.2;
	controls.enableDamping   = true;
	controls.enableRotate    = true;
	controls.enablePan       = false;
	controls.enableZoom      = true;
	  
	dragcontrols = new DragControls( dots, camera1, renderer.domElement );
	dragcontrols.addEventListener( 'dragstart', function ( event ) {

		event.object.material.emissive.set( 0xaaaaaa );
		controls.enabled = false;

	} );
	dragcontrols.addEventListener( 'drag', function ( event ) {

		event.object.material.emissive.set( 0xaaaaaa );
		let tmp3 = event.object.position.clone();
		tmp3.setLength(20);
		event.object.position.copy(tmp3);
		
		if (circlesVisible) {
			updateCircles2();
		}
		if (graphVisible) {
			updateGraph();
		}
	} );
	dragcontrols.addEventListener( 'dragend', function ( event ) {

		event.object.material.emissive.set( 0x000000 );
		controls.enabled = true;

	} );

};

const setBaseSphere = () => {

	const baseSphere   = new THREE.SphereGeometry(20, 55, 55);
	const baseMaterial = new THREE.MeshStandardMaterial({
		color:        0x9b66e6, 
		transparent:  true, 
		opacity:      0.9
	});
	baseMesh = new THREE.Mesh(baseSphere, baseMaterial);
	baseMesh.name = "sphere";
	scene1.add(baseMesh);

}

function compareNumbers (a,b) {

	return a-b;

}

class dot extends THREE.Mesh {

    constructor(geom, mat) {
        super(geom, mat);
		super.name = "dot";
    }

}

class circle extends THREE.Mesh {

    constructor(geom, mat) {
        super(geom, mat);
		super.name = "circle";
		this.center3 = new THREE.Vector3();
		this.radvec3 = new THREE.Vector3();
		this.dg = 11;
		this.visible = circlesVisible;
    }

}

class vertex extends THREE.Mesh {

    constructor(geom, mat) {
        super(geom, mat);
		super.name = "vertex";
		this.visible = false;
		this.black = true;
		this.vp = 99;
		this.opacity = 0.0;
    }

}

class vertexPair {
	
	constructor(index1, index2) {
		this.v1 = index1;
		this.v2 = index2;
		this.planeDots = [];
		this.posDots = [];
		this.negDots = [];
		this.neighborGroups = [];
		this.visible = false;
		this.valence = 0;
	}
	setVertexColors(plane) {
		if (plane.isPlane) {

			while (this.posDots.length > 0) {
				this.posDots.pop();
			}
			while (this.negDots.length > 0) {
				this.negDots.pop();
			}

			const vertDists = [];
			vertDists.push(Math.sign(plane.distanceToPoint(vertices[this.v1].position)));
			vertDists.push(Math.sign(plane.distanceToPoint(vertices[this.v2].position)));
				
			let tmpDist;
			for (let i=0; i<6; i++) {
				if (!this.planeDots.includes(i)) {
					tmpDist = Math.sign(plane.distanceToPoint(dots[i].position));
					if (tmpDist == vertDists[0]) {
						this.posDots.push(i);
					} else if (tmpDist == vertDists[1]) {
						this.negDots.push(i);
					}
				}
			}
			if (this.posDots.length == 1 && this.negDots.length == 2) {
				this.visible = true;
				vertices[this.v1].visible = true;
				vertices[this.v1].black = false;
				vertices[this.v2].visible = true;
				vertices[this.v2].black = true;
			} else if (this.posDots.length == 2 && this.negDots.length == 1) {
				this.visible = true;
				vertices[this.v1].visible = true;
				vertices[this.v1].black = true;
				vertices[this.v2].visible = true;
				vertices[this.v2].black = false;
			} else {
				this.visible = false;
				vertices[this.v1].visible = false;
				vertices[this.v2].visible = false;
			}
			
			this.setDisplay(this.visible);
			
			return true;
		}
		return false;
	}
	setDisplay(value) {
		this.visible = value;
		
		if (this.visible && graphVisible) {
			if (vertices[this.v1].visible && vertices[this.v2].visible) {
				if (vertices[this.v1].black) {
					vertices[this.v1].material.color.set(sphVertexColor1);
					vertices[this.v2].material.color.set(sphVertexColor2);
				} else {
					vertices[this.v2].material.color.set(sphVertexColor1);
					vertices[this.v1].material.color.set(sphVertexColor2);
				}
				vertices[this.v1].material.opacity = 1.0;
				vertices[this.v2].material.opacity = 1.0;
			} else {
				vertices[this.v1].material.opacity = 0.0;
				vertices[this.v2].material.opacity = 0.0;
			}
			
		} else {
			vertices[this.v1].material.opacity = 0.0;
			vertices[this.v2].material.opacity = 0.0;
		}

		return true;
	}
	isNeighbor(vp) {
		if (this.neighborGroups.includes(vp)) {
			return true;
		}
		return false;
	}
	
}

class edge extends THREE.Line {
	
	constructor (v1, v2) {
		const curve = new THREE.CatmullRomCurve3([
			vertices[v1].position,
			new THREE.Vector3( (vertices[v1].position.x *4 + vertices[v2].position.x)/5, 
							(vertices[v1].position.y *4 + vertices[v2].position.y)/5,
							(vertices[v1].position.z *4 + vertices[v2].position.z)/5 ).setLength(vertexRadius),
			new THREE.Vector3( (vertices[v1].position.x + vertices[v2].position.x)/2, 
							(vertices[v1].position.y + vertices[v2].position.y)/2,
							(vertices[v1].position.z + vertices[v2].position.z)/2 ).setLength(vertexRadius),
			new THREE.Vector3( (vertices[v1].position.x + vertices[v2].position.x *4)/5, 
							(vertices[v1].position.y + vertices[v2].position.y *4)/5,
							(vertices[v1].position.z + vertices[v2].position.z *4)/5 ).setLength(vertexRadius),
			vertices[v2].position],
			false,
			"chordal"
		);
		const points = curve.getPoints( 50 );
		
		const material = new THREE.LineBasicMaterial( { color: sphEdgeColor } );
		const geometry = new THREE.BufferGeometry().setFromPoints( points );
		super(geometry, material);

		this.start = v1;
		this.end = v2;
		this.visible = false;
	}
}

class dotGroup {

	constructor(index1, index2, index3) {

		this.left = [index1, index2, index3];
		this.left.sort(compareNumbers);
		this.right = [];
		for (let i=0; i<6; i++) {
			if (i != index1 && i != index2 && i != index3) this.right.push(i);
		}
		this.center2 = new THREE.Vector2();
		this.radius2 = 0.0;
		this.circles = 0;
		this.plane = new THREE.Plane();
		this.center3 = new THREE.Vector3();
		this.radius3 = new THREE.Vector3();

	}
	areDotsDivided() {
		if (this.plane.isPlane) {

			let distances = [];
			for (let i=0; i<dots.length; i++) {
				const tmpDist = Math.sign(this.plane.distanceToPoint(dots[i].position));
				distances.push(tmpDist);
			}
			if (distances[this.left[0]] == distances[this.left[1]] && distances[this.left[0]] == distances[this.left[2]]) {
				if (distances[this.left[0]] != distances[this.right[0]]) {
					if (distances[this.right[0]] == distances[this.right[1]] && distances[this.right[0]] == distances[this.right[2]]) {
						return true;
					}
				}
			}
		}
		return false;
	}
	getPlane() {
		if (this.circles > 0) return false;

		let pt1 = new THREE.Vector3();
		let pt2 = new THREE.Vector3();
		let pt3 = new THREE.Vector3();
		let tmpDist, indexL, indexR, currIndex;

		let distanceMat = [9999.999, 9999.999, 9999.999, 9999.999, 9999.999, 9999.999, 9999.999, 9999.999, 9999.999];
		let closest = [0,0,0,0,0,0,0,0,0];
		for (let i=0; i<3; i++) {
			for (let j=0; j<3; j++) {
				currIndex = 3*i + j;
				tmpDist = dots[this.left[i]].position.distanceTo(dots[this.right[j]].position);
				distanceMat[currIndex] = tmpDist;
				
				let newIndex = currIndex;
				while (newIndex > 0 && distanceMat[closest[newIndex-1]] > tmpDist) {
					closest[newIndex] = closest[newIndex-1];
					newIndex--;
				}
				closest[newIndex] = 3*i + j;
			}
		}
		
		let i = 0;
		let j = 1;
		let	k = 2;
		while (i<7) {
			indexR = closest[i] %3;
			indexL = (closest[i] - indexR)/3;
			pt1.x = (dots[this.left[indexL]].position.x + dots[this.right[indexR]].position.x)/2;
			pt1.y = (dots[this.left[indexL]].position.y + dots[this.right[indexR]].position.y)/2;
			pt1.z = (dots[this.left[indexL]].position.z + dots[this.right[indexR]].position.z)/2;
			
			j = i+1;
			while (j<8) {
				indexR = closest[j] %3;
				indexL = (closest[j] - indexR)/3;
				pt2.x = (dots[this.left[indexL]].position.x + dots[this.right[indexR]].position.x)/2;
				pt2.y = (dots[this.left[indexL]].position.y + dots[this.right[indexR]].position.y)/2;
				pt2.z = (dots[this.left[indexL]].position.z + dots[this.right[indexR]].position.z)/2;

				k = j+1;
				while (k<9) {
					indexR = closest[k] %3;
					indexL = (closest[k] - indexR)/3;
					pt3.x = (dots[this.left[indexL]].position.x + dots[this.right[indexR]].position.x)/2;
					pt3.y = (dots[this.left[indexL]].position.y + dots[this.right[indexR]].position.y)/2;
					pt3.z = (dots[this.left[indexL]].position.z + dots[this.right[indexR]].position.z)/2;

					let mat = new THREE.Matrix3(pt1.x, pt2.x, pt3.x, pt1.y, pt2.y, pt3.y, pt1.z, pt2.z, pt3.z);
					const det = mat.determinant();

					if ( det > 0 ) {
						this.plane.setFromCoplanarPoints(pt1,pt2,pt3);
					} else if ( det < 0 ) {
						this.plane.setFromCoplanarPoints(pt1,pt3,pt2);
					} 

					if (this.areDotsDivided()) {

						const zeroVec = new THREE.Vector3(0.0, 0.0, 0.0);

						const normalVec = this.plane.normal.clone();
						normalVec.normalize();
						const distanceToCenter = Math.abs(this.plane.distanceToPoint(zeroVec));
						zeroVec.addScaledVector(normalVec, distanceToCenter);
						this.center3.copy(zeroVec);

						this.radius3.copy(pt1);
						this.radius3.addScaledVector(this.center3,-1.0);
						this.radius3.setLength(20.0*Math.sin(Math.acos(distanceToCenter/20.0)));

						return true;
					}
					k++;
				}
				j++;
			}
			i++;
		}
		
		return false;
	}

}

function setupDgList () {

	let j, jj, jjj, tmpDG;
	j=0;
	jj=j+1;
	while (jj<dots.length-1) {
		jjj=jj+1;
		while (jjj<dots.length) {
			tmpDG = new dotGroup(j,jj,jjj);
			dotGroups.push(tmpDG);
			jjj++;
		}
		jj++;
	}

}	

const setDots = () => {
	
    let tmpDot, randomx, randomy, randomz, scaleMag;
    const dotGeom = new THREE.SphereGeometry(0.7, 12, 12);
    const dotMat = new THREE.MeshPhongMaterial({color: 0x112211});
	
	let initPosArr = [-.940,.340,-.33,.562,.827,.36,-.206,.915,-.347,-.272,-.949,.160,-.613,-.142,.777,.563,-.374,-.737];
    for (let i = 0; i < 6; i++) {

		dotMat.transparent = false;
		tmpDot = new dot(dotGeom, dotMat);
		dots.push(tmpDot);
		
		tmpDot.position.x = initPosArr[3*i];
		tmpDot.position.y = initPosArr[3*i+1];
		tmpDot.position.z = initPosArr[3*i+2];
		tmpDot.position.normalize();
		tmpDot.position.setLength(20);

		scene1.add(tmpDot);

    }
	
}

const updateDotPositionTable = () => {
	
    for (let i = 0; i < 6; i++) {
        table1[i*4+4].textContent = i+1;
		table1[i*4+5].textContent = (dots[i].position.x /20).toFixed(4);
		table1[i*4+6].textContent = (dots[i].position.y /20).toFixed(4);
		table1[i*4+7].textContent = (dots[i].position.z /20).toFixed(4);
    }
	
}

const setCircles2 = () => {

	let tmpCircle, torusGeom, torusMat, ctr3;

	for (let i=0; i<10; i++) {

		if (dotGroups[i].getPlane()) {

			dotGroups[i].circles = 1;

			let radius3 = dotGroups[i].radius3.length();
			let ctr3 = dotGroups[i].center3.clone();

			torusGeom = new THREE.TorusGeometry(radius3,0.2,12,60);
			torusMat = new THREE.MeshBasicMaterial({ color: circleColor });
			tmpCircle = new circle(torusGeom, torusMat);
			tmpCircle.center3.copy(dotGroups[i].center3);
			tmpCircle.radvec3.copy(dotGroups[i].radius3);
			tmpCircle.dg = i;
			circles.push(tmpCircle);
			circleGeoms.push(torusGeom);

			scene1.add(tmpCircle);

			tmpCircle.translateX(ctr3.x);
			tmpCircle.translateY(ctr3.y);
			tmpCircle.translateZ(ctr3.z);

			const targetVector = new THREE.Vector3(ctr3.x, ctr3.y, ctr3.z).normalize(); // Replace with your vector

			const up = new THREE.Vector3(0, 0, 1); // Torus' local Z-axis is its default "up" direction
			const axis = new THREE.Vector3().crossVectors(up, targetVector).normalize();

			const angle = Math.acos(up.dot(targetVector));

			tmpCircle.quaternion.setFromAxisAngle(axis, angle);

		}

	}
	
}

const cleanupCircles = () => {
	
	if (circleUpdateFreq == 1) {
		for (let i=0; i<circles.length; i++) {
			scene1.remove(circles[i]);
			circleGeoms[i].dispose();
			let currDg = circles[i].dg;
			circles.splice(i,1);
			circleGeoms.splice(i,1);
			dotGroups[currDg].circles = 0;
		}
	} else if (circleUpdateFreq == 0) {
		for (let i=0; i<circles.length; i++) {
			if (!dotGroups[circles[i].dg].areDotsDivided()) {
				scene1.remove(circles[i]);
				circleGeoms[i].dispose();
				let currDg = circles[i].dg;
				circles.splice(i,1);
				circleGeoms.splice(i,1);
				dotGroups[currDg].circles = 0;
			}
		}
	}
}		

const updateCircles2 = () => {

	let tmpCircle, torusGeom, torusMat, ctr3;

	cleanupCircles();
	
	for (let i=0; i<10; i++) {

		if (dotGroups[i].circles < 1) {
			if (dotGroups[i].getPlane()) {

				dotGroups[i].circles = 1;

				let radius3 = dotGroups[i].radius3.length();
				let ctr3 = dotGroups[i].center3.clone();

				torusGeom = new THREE.TorusGeometry(radius3,0.2,12,60);
				torusMat = new THREE.MeshBasicMaterial({ color: circleColor });
				tmpCircle = new circle(torusGeom, torusMat);
				tmpCircle.center3.copy(dotGroups[i].center3);
				tmpCircle.radvec3.copy(dotGroups[i].radius3);
				tmpCircle.dg = i;
				circles.push(tmpCircle);
				circleGeoms.push(torusGeom);

				scene1.add(tmpCircle);

				tmpCircle.translateX(ctr3.x);
				tmpCircle.translateY(ctr3.y);
				tmpCircle.translateZ(ctr3.z);

				const targetVector = new THREE.Vector3(ctr3.x, ctr3.y, ctr3.z).normalize(); // Replace with your vector

				const up = new THREE.Vector3(0, 0, 1); // Torus' local Z-axis is its default "up" direction
				const axis = new THREE.Vector3().crossVectors(up, targetVector).normalize();

				const angle = Math.acos(up.dot(targetVector));

				tmpCircle.quaternion.setFromAxisAngle(axis, angle);

			}
		}
	}
}

const setVertices = () => {
	
	let i=0;
	let j,k;
	while (i<4) {

		j = i+1;
		while (j<5) {

			k = j+1;
			while (k<6) {

				let currPlane = new THREE.Plane();
				let mat = new THREE.Matrix3(dots[i].position.x, dots[j].position.x, dots[k].position.x, 
				                            dots[i].position.y, dots[j].position.y, dots[k].position.y, 
											dots[i].position.z, dots[j].position.z, dots[k].position.z);
				const det = mat.determinant();
				if ( det > 0 ) {
					currPlane.setFromCoplanarPoints(dots[i].position, dots[j].position, dots[k].position);
				} else if ( det < 0 ) {
					currPlane.setFromCoplanarPoints(dots[i].position, dots[k].position, dots[j].position);
				}

			    let tmpVert;
				let tmpPos1 = new THREE.Vector3(0.0, 0.0, 0.0);
				let tmpPos2 = new THREE.Vector3(0.0, 0.0, 0.0);
				let normalVec = currPlane.normal.clone();
				normalVec.normalize();
				tmpPos1.addScaledVector(normalVec, vertexRadius);
				tmpPos2.addScaledVector(normalVec, -vertexRadius);

				const vertGeom = new THREE.SphereGeometry(0.7, 12, 12);
				const vertMat1 = new THREE.MeshPhongMaterial({color: sphVertexColor1, opacity: 0.0});
				const vertMat2 = new THREE.MeshPhongMaterial({color: sphVertexColor1, opacity: 0.0});
				vertMat1.transparent = true;
				vertMat2.transparent = true;

				tmpVert = new vertex(vertGeom, vertMat1);
				vertices.push(tmpVert);
				tmpVert.position.copy(tmpPos1);
				scene1.add(tmpVert);

				tmpVert = new vertex(vertGeom, vertMat2);
				vertices.push(tmpVert);
				tmpVert.position.copy(tmpPos2);
				scene1.add(tmpVert);

				let tmpVP = new vertexPair(vertices.length -2, vertices.length -1);
				tmpVP.planeDots.push(i,j,k);
				vertices[tmpVP.v1].vp = vertexPairs.length;
				vertices[tmpVP.v2].vp = vertexPairs.length;
				vertexPairs.push(tmpVP);
				tmpVP.setVertexColors(currPlane);
				
				k++;
			}
			j++;
		}
		i++;
	}

	i=0;
	let jMax = vertexPairs.length;
	let iMax = jMax - 1;
	let neighbor = false;
	while (i < iMax) {
		j = i+1;
		while (j < jMax) {

			let intersection = vertexPairs[i].planeDots.filter(x => vertexPairs[j].planeDots.includes(x));
			if (intersection.length == 2) {
				vertexPairs[i].neighborGroups.push(j);
				vertexPairs[j].neighborGroups.push(i);
			}
			j++;
		}
		i++;
	}

}

// function cleanValence4 (i) {
	
	// for (const j of vertexPairs[i].neighborGroups) {
		// if (vertexPairs[j].visible) {
			// if (vertexPairs[j].valence == 4) {
				// if (edges[vertexPairs[i].v1][vertexPairs[j].v1].visible) {
					// edges[vertexPairs[i].v1][vertexPairs[j].v1].visible = false;
					// edges[vertexPairs[i].v2][vertexPairs[j].v2].visible = false;
					// vertexPairs[i].valence--;
					// vertexPairs[j].valence--;
					// return true;
				// } else if (edges[vertexPairs[i].v1][vertexPairs[j].v2].visible) {
					// edges[vertexPairs[i].v1][vertexPairs[j].v2].visible = false;
					// edges[vertexPairs[i].v2][vertexPairs[j].v1].visible = false;
					// vertexPairs[i].valence--;
					// vertexPairs[j].valence--;
					// return true;
				// }
			// }
		// }	
	// }				
	
	// return false;
// }

// function cleanValence2 (i) {
	
	// for (const j of vertexPairs[i].neighborGroups) {
		// if (vertexPairs[j].visible) {
			// if (edges[vertexPairs[i].v1][vertexPairs[j].v1].visible == false && edges[vertexPairs[i].v1][vertexPairs[j].v2].visible == false) {
				// if (vertexPairs[j].valence == 3) {
					// for (const k of vertexPairs[j].neighborGroups) {
						// if (vertexPairs[k].visible) {
							// if (vertexPairs[k].valence == 4) {
								// if (edges[vertexPairs[j].v1][vertexPairs[k].v1].visible) {
									// edges[vertexPairs[j].v1][vertexPairs[k].v1].visible = false;
									// edges[vertexPairs[j].v2][vertexPairs[k].v2].visible = false;
									// if (vertices[vertexPairs[i].v1].position.distanceTo(vertices[vertexPairs[j].v1].position) < vertices[vertexPairs[i].v1].position.distanceTo(vertices[vertexPairs[j].v2].position)) {
										// edges[vertexPairs[j].v1][vertexPairs[i].v1].visible = true;
										// edges[vertexPairs[j].v2][vertexPairs[i].v2].visible = true;
									// } else {
										// edges[vertexPairs[j].v1][vertexPairs[i].v2].visible = true;
										// edges[vertexPairs[j].v2][vertexPairs[i].v1].visible = true;
									// }
									// vertexPairs[k].valence--;
									// vertexPairs[i].valence++;
									
									// return true;

								// } else if (edges[vertexPairs[j].v1][vertexPairs[k].v2].visible) {
									// edges[vertexPairs[j].v1][vertexPairs[k].v2].visible = false;
									// edges[vertexPairs[j].v2][vertexPairs[k].v1].visible = false;
									// if (vertices[vertexPairs[i].v1].position.distanceTo(vertices[vertexPairs[j].v1].position) < vertices[vertexPairs[i].v1].position.distanceTo(vertices[vertexPairs[j].v2].position)) {
										// edges[vertexPairs[j].v1][vertexPairs[i].v1].visible = true;
										// edges[vertexPairs[j].v2][vertexPairs[i].v2].visible = true;
									// } else {
										// edges[vertexPairs[j].v1][vertexPairs[i].v2].visible = true;
										// edges[vertexPairs[j].v2][vertexPairs[i].v1].visible = true;
									// }
									// vertexPairs[k].valence--;
									// vertexPairs[i].valence++;

									// return true;
								// }								
							// }
						// }
					// }
				// } 
			// }
		// }	
	// }				
	
	// return false;
// }

// const cleanEdges = () => {
	// let foundSomething;
	// do{
		// foundSomething = false;
		// for (let i=0; i< vertexPairs.length; i++) {
			// if (vertexPairs[i].visible) {
				// if (vertexPairs[i].valence == 4) {

					// if (cleanValence4(i)) foundSomething = true;
					
				// } else if (vertexPairs[i].valence == 2) {
					
					// if (cleanValence2(i)) foundSomething = true;
				// }
			// }
		// }
	// }while(foundSomething);
	
// }

// const cleanTriangles = () => {
	// let foundSomething;
	// do{
		// foundSomething = false;

		// for (let i=0; i<vertexPairs.length; i++) {
			// if (vertexPairs[i].visible) {
				// for (const j of vertexPairs[i].neighborGroups) {
					// if (vertexPairs[j].visible) {
						// if (edges[vertexPairs[i].v1][vertexPairs[j].v1].visible){
							// for (const k of vertexPairs[j].neighborGroups) {
								// if (vertexPairs[i].isNeighbor(k) && vertexPairs[k].visible) {
									// if (edges[vertexPairs[i].v1][vertexPairs[k].v1].visible && edges[vertexPairs[j].v1][vertexPairs[k].v1].visible){
										// foundSomething = true;
										// if (vertices[vertexPairs[i].v1].black == vertices[vertexPairs[j].v1].black) {
											// edges[vertexPairs[i].v1][vertexPairs[j].v1].visible = false;
											// edges[vertexPairs[i].v2][vertexPairs[j].v2].visible = false;
											// vertexPairs[i].valence -= 2;
											// vertexPairs[j].valence -= 2;
										// } else if (vertices[vertexPairs[i].v1].black == vertices[vertexPairs[k].v1].black) {
											// edges[vertexPairs[i].v1][vertexPairs[k].v1].visible = false;
											// edges[vertexPairs[i].v2][vertexPairs[k].v2].visible = false;
											// vertexPairs[i].valence -= 2;
											// vertexPairs[k].valence -= 2;
										// } else if (vertices[vertexPairs[j].v1].black == vertices[vertexPairs[k].v1].black) {
											// edges[vertexPairs[j].v1][vertexPairs[k].v1].visible = false;
											// edges[vertexPairs[j].v2][vertexPairs[k].v2].visible = false;
											// vertexPairs[k].valence -= 2;
											// vertexPairs[j].valence -= 2;
										// }
									// } else if (edges[vertexPairs[i].v1][vertexPairs[k].v2].visible && edges[vertexPairs[j].v1][vertexPairs[k].v2].visible){
										// foundSomething = true;
										// if (vertices[vertexPairs[i].v1].black == vertices[vertexPairs[j].v1].black) {
											// edges[vertexPairs[i].v1][vertexPairs[j].v1].visible = false;
											// edges[vertexPairs[i].v2][vertexPairs[j].v2].visible = false;
											// vertexPairs[i].valence -= 2;
											// vertexPairs[j].valence -= 2;
										// } else if (vertices[vertexPairs[i].v1].black == vertices[vertexPairs[k].v2].black) {
											// edges[vertexPairs[i].v1][vertexPairs[k].v2].visible = false;
											// edges[vertexPairs[i].v2][vertexPairs[k].v1].visible = false;
											// vertexPairs[i].valence -= 2;
											// vertexPairs[k].valence -= 2;
										// } else if (vertices[vertexPairs[j].v1].black == vertices[vertexPairs[k].v2].black) {
											// edges[vertexPairs[j].v1][vertexPairs[k].v2].visible = false;
											// edges[vertexPairs[j].v2][vertexPairs[k].v1].visible = false;
											// vertexPairs[k].valence -= 2;
											// vertexPairs[j].valence -= 2;
										// }
										
									// }
								// }
							// }

						// } else if (edges[vertexPairs[i].v1][vertexPairs[j].v2].visible){
							// for (const k of vertexPairs[j].neighborGroups) {
								// if (vertexPairs[i].isNeighbor(k) && vertexPairs[k].visible) {
									// if (edges[vertexPairs[i].v1][vertexPairs[k].v1].visible && edges[vertexPairs[j].v2][vertexPairs[k].v1].visible){
										// foundSomething = true;
										// if (vertices[vertexPairs[i].v1].black == vertices[vertexPairs[j].v2].black) {
											// edges[vertexPairs[i].v1][vertexPairs[j].v1].visible = false;
											// edges[vertexPairs[i].v2][vertexPairs[j].v2].visible = false;
											// vertexPairs[i].valence -= 2;
											// vertexPairs[j].valence -= 2;
										// } else if (vertices[vertexPairs[i].v1].black == vertices[vertexPairs[k].v1].black) {
											// edges[vertexPairs[i].v1][vertexPairs[k].v1].visible = false;
											// edges[vertexPairs[i].v2][vertexPairs[k].v2].visible = false;
											// vertexPairs[i].valence -= 2;
											// vertexPairs[k].valence -= 2;
										// } else if (vertices[vertexPairs[j].v2].black == vertices[vertexPairs[k].v1].black) {
											// edges[vertexPairs[j].v2][vertexPairs[k].v1].visible = false;
											// edges[vertexPairs[j].v1][vertexPairs[k].v2].visible = false;
											// vertexPairs[k].valence -= 2;
											// vertexPairs[j].valence -= 2;
										// }
									// } else if (edges[vertexPairs[i].v1][vertexPairs[k].v2].visible && edges[vertexPairs[j].v2][vertexPairs[k].v2].visible){
										// foundSomething = true;
										// if (vertices[vertexPairs[i].v1].black == vertices[vertexPairs[j].v1].black) {
											// edges[vertexPairs[i].v1][vertexPairs[j].v2].visible = false;
											// edges[vertexPairs[i].v2][vertexPairs[j].v1].visible = false;
											// vertexPairs[i].valence -= 2;
											// vertexPairs[j].valence -= 2;
										// } else if (vertices[vertexPairs[i].v1].black == vertices[vertexPairs[k].v2].black) {
											// edges[vertexPairs[i].v1][vertexPairs[k].v2].visible = false;
											// edges[vertexPairs[i].v2][vertexPairs[k].v1].visible = false;
											// vertexPairs[i].valence -= 2;
											// vertexPairs[k].valence -2;
										// } else if (vertices[vertexPairs[j].v2].black == vertices[vertexPairs[k].v2].black) {
											// edges[vertexPairs[j].v1][vertexPairs[k].v2].visible = false;
											// edges[vertexPairs[j].v2][vertexPairs[k].v1].visible = false;
											// vertexPairs[k].valence -= 2;
											// vertexPairs[j].valence -= 2;
										// }
									// }
								// }
							// }
						// }
					// }
				// }
			// }
		// }
		// if (foundSomething) console.log("cleaned a triangle");
		
	// }while(foundSomething);

// }

// const glueUnboundedRegions = () => {
	// let foundSomething;
	// do{
		// foundSomething = false;
		// for (let i=0; i<vertexPairs.length; i++) {
			// for (const j of vertexPairs[i].neighborGroups) {
				// let intersectionIJ = vertexPairs[i].planeDots.filter(x => vertexPairs[j].planeDots.includes(x));
				// for (const k of vertexPairs[j].neighborGroups) {
					// if (k != i) {
						// let intersection = intersectionIJ.filter(x => vertexPairs[k].planeDots.includes(x));
						// if (intersection.length == 2) {
							// //not enough
							// //what to check
						// }
					// }
				// }
			// }
		// }
	// }while(foundSomething);
// }

const setEdgeVisibility = () => {

	let i, j, iMax, jMax, tmpEdge;
	let vCount = 0;
	
	jMax = vertexPairs.length;
	iMax = jMax - 1;
	for (j=0; j<jMax; j++) {
		vertexPairs[j].valence = 0;
	}

	for (i=0; i<iMax; i++) {
		for (j=i+1; j<jMax; j++) {
			if (vertexPairs[i].isNeighbor(j)) {
				edges[vertexPairs[i].v1][vertexPairs[j].v1].visible = false;
				edges[vertexPairs[i].v1][vertexPairs[j].v2].visible = false;
				edges[vertexPairs[i].v2][vertexPairs[j].v1].visible = false;
				edges[vertexPairs[i].v2][vertexPairs[j].v2].visible = false;
				
				if (graphVisible) {

					if (vertexPairs[i].visible && vertexPairs[j].visible) {
						let startArr = [...new Set([...vertexPairs[i].planeDots, ...vertexPairs[i].posDots])];
						let endArr   = [...new Set([...vertexPairs[j].planeDots, ...vertexPairs[j].posDots])];
						let posIntersection = startArr.filter(x => endArr.includes(x));

						if (posIntersection.length == 2) {
							edges[vertexPairs[i].v1][vertexPairs[j].v2].visible = true;
							edges[vertexPairs[i].v2][vertexPairs[j].v1].visible = true;
							vertexPairs[i].valence++;
							vertexPairs[j].valence++;
							vCount += 2;
						} else if (posIntersection.length == 4) {
							edges[vertexPairs[i].v1][vertexPairs[j].v1].visible = true;
							edges[vertexPairs[i].v2][vertexPairs[j].v2].visible = true;
							vertexPairs[i].valence++;
							vertexPairs[j].valence++;
							vCount += 2;
						}
					}
				}
			}
		}
	}
	
	//glueUnboundedRegions();
	//cleanTriangles();
	//cleanEdges();
	//console.log(vCount, "edges");

}

const setEdges = () => {
	
	let i, j, iMax, jMax, tmpEdge;
	edges = new Array(vertices.length);
	for (i=0; i < vertices.length; i++) {
		edges[i] = new Array(vertices.length);
	}

	i = 0;
	jMax = vertexPairs.length;
	iMax = jMax - 1;
	while (i < iMax) {
		j = i+1;
		while (j < jMax) {
			if (vertexPairs[i].isNeighbor(j)) {
				tmpEdge = new edge(vertexPairs[i].v1, vertexPairs[j].v1);
				edges[vertexPairs[i].v1][vertexPairs[j].v1] = tmpEdge;
				edges[vertexPairs[j].v1][vertexPairs[i].v1] = tmpEdge;
				scene1.add(tmpEdge);

				tmpEdge = new edge(vertexPairs[i].v1, vertexPairs[j].v2);
				edges[vertexPairs[i].v1][vertexPairs[j].v2] = tmpEdge;
				edges[vertexPairs[j].v2][vertexPairs[i].v1] = tmpEdge;
				scene1.add(tmpEdge);

				tmpEdge = new edge(vertexPairs[i].v2, vertexPairs[j].v1);
				edges[vertexPairs[i].v2][vertexPairs[j].v1] = tmpEdge;
				edges[vertexPairs[j].v1][vertexPairs[i].v2] = tmpEdge;
				scene1.add(tmpEdge);

				tmpEdge = new edge(vertexPairs[i].v2, vertexPairs[j].v2);
				edges[vertexPairs[i].v2][vertexPairs[j].v2] = tmpEdge;
				edges[vertexPairs[j].v2][vertexPairs[i].v2] = tmpEdge;
				scene1.add(tmpEdge);
			}
			j++;
		}
		i++;
	}
}

const setGraph = () => {
	
	setVertices();
	setEdges();
	
}

const updateVertices = () => {
	
	for (let i=0; i<vertexPairs.length; i++) {
		
		let dot1 = vertexPairs[i].planeDots[0];
		let dot2 = vertexPairs[i].planeDots[1];
		let dot3 = vertexPairs[i].planeDots[2];

		let currPlane = new THREE.Plane();
		let mat = new THREE.Matrix3(dots[dot1].position.x, dots[dot2].position.x, dots[dot3].position.x, 
		                            dots[dot1].position.y, dots[dot2].position.y, dots[dot3].position.y, 
									dots[dot1].position.z, dots[dot2].position.z, dots[dot3].position.z);
		const det = mat.determinant();
		if ( det > 0 ) {
			currPlane.setFromCoplanarPoints(dots[dot1].position, dots[dot2].position, dots[dot3].position);
		} else if ( det < 0 ) {
			currPlane.setFromCoplanarPoints(dots[dot1].position, dots[dot3].position, dots[dot2].position);
		}

	    let tmpVert;
		let tmpPos1 = new THREE.Vector3(0.0, 0.0, 0.0);
		let tmpPos2 = new THREE.Vector3(0.0, 0.0, 0.0);
		let normalVec = currPlane.normal.clone();
		normalVec.normalize();
		tmpPos1.addScaledVector(normalVec, vertexRadius);
		tmpPos2.addScaledVector(normalVec, -vertexRadius);
				
		vertices[vertexPairs[i].v1].position.copy(tmpPos1);
		vertices[vertexPairs[i].v2].position.copy(tmpPos2);

		vertexPairs[i].setVertexColors(currPlane);
				
	}
	
}

const updateEdges = () => {
	
	if (graphVisible) {
		let i, j, iMax, jMax, tmpEdge;
		i = 0;
		jMax = vertexPairs.length;
		iMax = jMax - 1;
		while (i < iMax) {
			j = i+1;
			while (j < jMax) {
				
				if (vertexPairs[i].isNeighbor(j)) {
				
					const curve1 = new THREE.CatmullRomCurve3([
						vertices[vertexPairs[i].v1].position,
						new THREE.Vector3( (vertices[vertexPairs[i].v1].position.x *4 + vertices[vertexPairs[j].v1].position.x)/5, 
										(vertices[vertexPairs[i].v1].position.y *4 + vertices[vertexPairs[j].v1].position.y)/5,
										(vertices[vertexPairs[i].v1].position.z *4 + vertices[vertexPairs[j].v1].position.z)/5 ).setLength(vertexRadius),
						new THREE.Vector3( (vertices[vertexPairs[i].v1].position.x + vertices[vertexPairs[j].v1].position.x)/2, 
										(vertices[vertexPairs[i].v1].position.y + vertices[vertexPairs[j].v1].position.y)/2,
										(vertices[vertexPairs[i].v1].position.z + vertices[vertexPairs[j].v1].position.z)/2 ).setLength(vertexRadius),
						new THREE.Vector3( (vertices[vertexPairs[i].v1].position.x + vertices[vertexPairs[j].v1].position.x *4)/5,
										(vertices[vertexPairs[i].v1].position.y + vertices[vertexPairs[j].v1].position.y *4)/5,
										(vertices[vertexPairs[i].v1].position.z + vertices[vertexPairs[j].v1].position.z *4)/5 ).setLength(vertexRadius),
						vertices[vertexPairs[j].v1].position],
						false,
						"chordal"
					);
					const points1 = curve1.getPoints( 50 );
					edges[vertexPairs[i].v1][vertexPairs[j].v1].geometry.setFromPoints(points1);

					const curve2 = new THREE.CatmullRomCurve3([
						vertices[vertexPairs[i].v1].position,
						new THREE.Vector3( (vertices[vertexPairs[i].v1].position.x *4 + vertices[vertexPairs[j].v2].position.x)/5, 
										(vertices[vertexPairs[i].v1].position.y *4 + vertices[vertexPairs[j].v2].position.y)/5,
										(vertices[vertexPairs[i].v1].position.z *4 + vertices[vertexPairs[j].v2].position.z)/5 ).setLength(vertexRadius),
						new THREE.Vector3( (vertices[vertexPairs[i].v1].position.x + vertices[vertexPairs[j].v2].position.x)/2, 
										(vertices[vertexPairs[i].v1].position.y + vertices[vertexPairs[j].v2].position.y)/2,
										(vertices[vertexPairs[i].v1].position.z + vertices[vertexPairs[j].v2].position.z)/2 ).setLength(vertexRadius),
						new THREE.Vector3( (vertices[vertexPairs[i].v1].position.x + vertices[vertexPairs[j].v2].position.x *4)/5,
										(vertices[vertexPairs[i].v1].position.y + vertices[vertexPairs[j].v2].position.y *4)/5,
										(vertices[vertexPairs[i].v1].position.z + vertices[vertexPairs[j].v2].position.z *4)/5 ).setLength(vertexRadius),
						vertices[vertexPairs[j].v2].position],
						false,
						"chordal"
					);
					const points2 = curve2.getPoints( 50 );
					edges[vertexPairs[i].v1][vertexPairs[j].v2].geometry.setFromPoints(points2);

					const curve3 = new THREE.CatmullRomCurve3([
						vertices[vertexPairs[i].v2].position,
						new THREE.Vector3( (vertices[vertexPairs[i].v2].position.x *4 + vertices[vertexPairs[j].v1].position.x)/5, 
										(vertices[vertexPairs[i].v2].position.y *4 + vertices[vertexPairs[j].v1].position.y)/5,
										(vertices[vertexPairs[i].v2].position.z *4 + vertices[vertexPairs[j].v1].position.z)/5 ).setLength(vertexRadius),
						new THREE.Vector3( (vertices[vertexPairs[i].v2].position.x + vertices[vertexPairs[j].v1].position.x)/2, 
										(vertices[vertexPairs[i].v2].position.y + vertices[vertexPairs[j].v1].position.y)/2,
										(vertices[vertexPairs[i].v2].position.z + vertices[vertexPairs[j].v1].position.z)/2 ).setLength(vertexRadius),
						new THREE.Vector3( (vertices[vertexPairs[i].v2].position.x + vertices[vertexPairs[j].v1].position.x *4)/5,
										(vertices[vertexPairs[i].v2].position.y + vertices[vertexPairs[j].v1].position.y *4)/5,
										(vertices[vertexPairs[i].v2].position.z + vertices[vertexPairs[j].v1].position.z *4)/5 ).setLength(vertexRadius),
						vertices[vertexPairs[j].v1].position],
						false,
						"chordal"
					);
					const points3 = curve3.getPoints( 50 );
					edges[vertexPairs[i].v2][vertexPairs[j].v1].geometry.setFromPoints(points3);

					const curve4 = new THREE.CatmullRomCurve3([
						vertices[vertexPairs[i].v2].position,
						new THREE.Vector3( (vertices[vertexPairs[i].v2].position.x *4 + vertices[vertexPairs[j].v2].position.x)/5, 
										(vertices[vertexPairs[i].v2].position.y *4 + vertices[vertexPairs[j].v2].position.y)/5,
										(vertices[vertexPairs[i].v2].position.z *4 + vertices[vertexPairs[j].v2].position.z)/5 ).setLength(vertexRadius),
						new THREE.Vector3( (vertices[vertexPairs[i].v2].position.x + vertices[vertexPairs[j].v2].position.x)/2, 
										(vertices[vertexPairs[i].v2].position.y + vertices[vertexPairs[j].v2].position.y)/2,
										(vertices[vertexPairs[i].v2].position.z + vertices[vertexPairs[j].v2].position.z)/2 ).setLength(vertexRadius),
						new THREE.Vector3( (vertices[vertexPairs[i].v2].position.x + vertices[vertexPairs[j].v2].position.x *4)/5,
										(vertices[vertexPairs[i].v2].position.y + vertices[vertexPairs[j].v2].position.y *4)/5,
										(vertices[vertexPairs[i].v2].position.z + vertices[vertexPairs[j].v2].position.z *4)/5 ).setLength(vertexRadius),
						vertices[vertexPairs[j].v2].position],
						false,
						"chordal"
					);
					const points4 = curve4.getPoints( 50 );
					edges[vertexPairs[i].v2][vertexPairs[j].v2].geometry.setFromPoints(points4);
				}
				j++;
			}
			i++;
		}
	}
	
	setEdgeVisibility();
	
}

const updateGraph = () => {
	
	updateVertices();
	updateEdges();
	
}
	
const guiObj = {
	autoRotate: false,
	sphereColor: 0x9b66e6,
	sphereOpacity: 0.9,
	displayCoordinates: true,
	animateDots: false,
	dotSpeed: 10,
	dotColor: 0x112211,
	displayCircles: true,
	circleColor: 0x202020,
	circleUpdates: 1,
	displayGraph: false,
	graphScale: 1.02,
	vertexColor1: 0x5ac3d8,
	vertexColor2: 0xffc800,
	edgeColor: 0xd85ac7
}
gui.add(guiObj, 'autoRotate').onChange( value => {
	controls.autoRotate = value;
} );
gui.addColor(guiObj, 'sphereColor').onChange( value => {
	baseMesh.material.color.set(value);
} );
gui.add(guiObj, 'sphereOpacity', 0, 1).onChange( value => {
	baseMesh.material.opacity = value;
} );
const dotFolder = gui.addFolder( 'dots' );
dotFolder.add(guiObj, 'displayCoordinates').onChange( value => {
	tableContainer.style.display = value ? 'table' : 'none';
} );
dotFolder.add(guiObj, 'animateDots');
let angle = 0.0001 * guiObj.dotSpeed;
let cosAngle = Math.cos(angle);
let sinAngle = Math.sin(angle);
let Rx = new THREE.Matrix3(1, 0, 0, 0, cosAngle, -sinAngle, 0, sinAngle, cosAngle); 
let Ry = new THREE.Matrix3(cosAngle, 0, sinAngle, 0, 1, 0, -sinAngle, 0, cosAngle);
let Rz = new THREE.Matrix3(cosAngle, -sinAngle, 0, sinAngle, cosAngle, 0, 0, 0, 1);
let Rxy = new THREE.Matrix3();
Rxy.multiplyMatrices(Rx, Ry);
let Rxz = new THREE.Matrix3();
Rxz.multiplyMatrices(Rx, Rz);
let Ryz = new THREE.Matrix3();
Ryz.multiplyMatrices(Ry, Rz);
dotFolder.add(guiObj, 'dotSpeed', 1, 25).onChange (value => {
	angle = 0.0001 * value;
	cosAngle = Math.cos(angle);
	sinAngle = Math.sin(angle);
	Rx.set(1, 0, 0, 0, cosAngle, -sinAngle, 0, sinAngle, cosAngle); 
	Ry.set(cosAngle, 0, sinAngle, 0, 1, 0, -sinAngle, 0, cosAngle);
	Rz.set(cosAngle, -sinAngle, 0, sinAngle, cosAngle, 0, 0, 0, 1);
	Rxy.multiplyMatrices(Rx, Ry);
	Rxz.multiplyMatrices(Rx, Rz);
	Ryz.multiplyMatrices(Ry, Rz);
} );
dotFolder.addColor(guiObj, 'dotColor').onChange( value => {
	for (let j=0; j<dots.length; j++) {
		dots[j].material.color.set(value);
	}
} );
const circleFolder = gui.addFolder( 'circles' );
circleFolder.add(guiObj, 'displayCircles').onChange( value => {
	circlesVisible = value;

	for (let i=0; i<circles.length; i++) {
		circles[i].visible = circlesVisible;
	}
} );
circleFolder.addColor(guiObj, 'circleColor').onChange( value => {
	circleColor = value;
	for (let i=0; i<circles.length; i++) {
		circles[i].material.color.set(value);
	}
} );
circleFolder.add(guiObj, 'circleUpdates', {less: 0, more:1}).onChange( value => {
	circleUpdateFreq = value;
} );
const graphFolder = gui.addFolder( 'sphebic graph (in development)' );
graphFolder.add(guiObj, 'displayGraph').onChange( value => {
	graphVisible = value;
	updateGraph();
} );
graphFolder.add(guiObj, 'graphScale', 1.0, 2.0).onChange( value => {
	vertexRadius = value * 20.0;
	updateGraph();
} );
graphFolder.addColor(guiObj, 'vertexColor1').onChange( value => {
	sphVertexColor1 = value;
	updateVertices();
} );
graphFolder.addColor(guiObj, 'vertexColor2').onChange( value => {
	sphVertexColor2 = value;
	updateVertices();
} );
graphFolder.addColor(guiObj, 'edgeColor').onChange( value => {
	sphEdgeColor = value;
	
	let i, j, iMax, jMax;
	i = 0;
	jMax = vertexPairs.length;
	iMax = jMax - 1;
	while (i < iMax) {
		j = i+1;
		while (j < jMax) {
			if (vertexPairs[i].isNeighbor(j)) {
				edges[vertexPairs[i].v1][vertexPairs[j].v1].material.color.set(value);
				edges[vertexPairs[i].v1][vertexPairs[j].v2].material.color.set(value);
				edges[vertexPairs[i].v2][vertexPairs[j].v1].material.color.set(value);
				edges[vertexPairs[i].v2][vertexPairs[j].v2].material.color.set(value);
			}
			j++;
		}
		i++;
	}
} );

function animate() {
    requestAnimationFrame(animate);

	if(guiObj.animateDots) {
		dots[0].position.applyMatrix3(Ry);
		dots[1].position.applyMatrix3(Rx);
		dots[2].position.applyMatrix3(Rz);
		dots[3].position.applyMatrix3(Ryz);
		dots[4].position.applyMatrix3(Rxy);
		dots[5].position.applyMatrix3(Rxz);
		
		if (circlesVisible) {
			updateCircles2();
		}
		if (graphVisible) {
			updateGraph();
		}

		renderer.render(scene1, camera1);

	}

}

const resize = () => {

	sizes = {
		width:  container.offsetWidth,
		height: container.offsetHeight
	};

	if(window.innerWidth > 700) camera1.position.z = 100;
	else camera1.position.z = 140;

	camera1.aspect = sizes.width / sizes.height;
	camera1.updateProjectionMatrix();

	renderer.setSize(sizes.width, sizes.height);

}

const mousemove = (event) => {

	isIntersecting = false;

	mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
	mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

	raycaster.setFromCamera(mouse, camera1);
	  
	const intersects = raycaster.intersectObject(baseMesh);
	if(intersects[0]) {
		isIntersecting = true;
		if(!grabbing) document.body.style.cursor = 'pointer';
	}
	else {
		if(!grabbing) document.body.style.cursor = 'default';
	}

}

const mousedown = () => {

	if(!isIntersecting) return;

	mouseDown         = true;
	minMouseDownFlag  = false;

	setTimeout(() => {
		minMouseDownFlag = true;
		if(!mouseDown) mouseup();
	}, 500);

	document.body.style.cursor  = 'grabbing';
	grabbing                    = true;

}

const mouseup = () => {

	mouseDown = false;
	if(!minMouseDownFlag) return;

	grabbing = false;
	if(isIntersecting) document.body.style.cursor = 'pointer';
	else document.body.style.cursor = 'default';

}

const listenTo = () => {

	window.addEventListener('resize',     resize.bind(this));
	window.addEventListener('mousemove',  mousemove.bind(this));
	window.addEventListener('mousedown',  mousedown.bind(this));
	window.addEventListener('mouseup',    mouseup.bind(this));

}

const render = () => {

	controls.update();
	renderer.clear();
	renderer.setViewport( 0, 0, window.innerWidth, window.innerHeight );
	renderer.render(scene1, camera1);
	requestAnimationFrame(render.bind(this));

	updateDotPositionTable();

	if (circlesVisible) {
		circlesOutput.textContent = circles.length;
	} else {
		circlesOutput.textContent = 0;
	}
  
}

setScene();
animate();

