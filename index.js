import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DragControls } from 'three/addons/controls/DragControls.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

const container = document.querySelector('.container');
const canvas    = document.querySelector('.canvas');

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
};	

// ---------------------------------------------------------------------------------
function getRandomInt() {

	return Math.ceil(Math.random() * 32676);

}

let R = [];
let INF = 1e18;

// Function to shuffle array
function shuffle(array) {

	let currentIndex = array.length, randomIndex;
	while (currentIndex != 0) {
		randomIndex = Math.floor(Math.random() * currentIndex);
		currentIndex--;
		[array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
	}
	return array;
}

class Circle2D {

	constructor(p = new THREE.Vector2(0, 0), b = 0)
	{
		this.C = p;
		this.R = b;
	}
};

function is_inside(c, p){
	
	let tmp = new THREE.Vector2();
	tmp.copy(p);
	
	return (tmp.distanceTo(c.C) <= c.R);
}

function get_circle_center( bx, by, cx, cy) {
	
	let tmpPt = new THREE.Vector2();
	let B = bx * bx + by * by;
	let C = cx * cx + cy * cy;
	let D = bx * cy - by * cx;
	tmpPt.x = (cy * B - by * C) / (2 * D);
	tmpPt.y = (bx * C - cx * B) / (2 * D); 
	return tmpPt;
}

function circle_from_3(A, B, C) 
{
	let I = get_circle_center(B.x - A.x, B.y - A.y, C.x - A.x, C.y - A.y);

	I.x += A.x;
	I.y += A.y;
	return new Circle2D(I, A.distanceTo(I));
}

function circle_from_2(A, B) {
	let C = new THREE.Vector2((A.x + B.x) / 2.0, (A.y + B.y) / 2.0);

	return new Circle2D(C, B.distanceTo(A) / 2.0);
}

function is_valid_circle(c, P) {

	for (let p in P) {
		if (!is_inside(c, p)) return false;
	}
	return true;
}

function min_circle_trivial(P) {
	
	if (P.length == 0) {
		return new Circle2D(new THREE.Vector2(0, 0), 0);
	} else if (P.length == 1) {
		return new Circle2D(P[0], 0);
	} else if (P.length == 2) {
		return circle_from_2(P[0], P[1]);
	}

	for (let i = 0; i < 3; i++) {
		for (let j = i + 1; j < 3; j++) {

			let c = circle_from_2(P[i], P[j]);
			if (is_valid_circle(c, P)) return c;
		}
	}
	return circle_from_3(P[0], P[1], P[2]);
	
}

function welzl_helper(P, n)
{

	if (n == 0 || R.length == 3) {
		return min_circle_trivial(R);
	}
	let idx = getRandomInt() % n;
	let p = new THREE.Vector2();
	p.copy(P[idx]);
	let temp = new THREE.Vector2();
	temp.copy(P[idx]);
	P[idx] = P[n - 1];
	P[n - 1] = temp;

	let d = welzl_helper(P, n - 1);

	if (is_inside(d, p)) {
		return d;
	}
	R.push(p);
	return welzl_helper(P, n - 1);

}

function welzl(P) {
	
	R = [];
	shuffle(P);
	return welzl_helper(P, P.length);
}

// Welzl's algorithm adapted from code by phasing17
// https://www.geeksforgeeks.org/minimum-enclosing-circle-using-welzls-algorithm/
// ---------------------------------------------------------------------------------


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
selection,
boundingradius;

let offset = new THREE.Vector3();
let dots = [];
let circles = [];
let circleGeoms = [];
let dotGroups = [];

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

	//scene1.add(new THREE.HemisphereLight(0xffffbb, 0x080820, 1.5));
	const light1 = new THREE.AmbientLight( 0xffffbb ); // soft white light
	scene1.add( light1 );

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
	setCircles();
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
		if (tmp3.z == 20) tmp3.z -= 0.01;
		tmp3.normalize();
		event.object.pos2.x = tmp3.x / (1 - tmp3.z);
		event.object.pos2.y = tmp3.y / (1 - tmp3.z);
		tmp3.setLength(20);
		event.object.position.copy(tmp3);
		
		updateCircles();

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
		this.pos2 = new THREE.Vector2();
    }

}

class circle extends THREE.Mesh {

    constructor(geom, mat) {
        super(geom, mat);
		super.name = "circle";
		this.center2 = new THREE.Vector2();
		this.point2 = new THREE.Vector2();
		this.center3 = new THREE.Vector3();
		this.point3 = new THREE.Vector3();
		this.radvec2 = new THREE.Vector2();
		this.radvec3 = new THREE.Vector3();
		this.dg = 11;
    }

}

function notThreeInside (ctr, rad) {

	let distances = [];
	for (let i=0; i<6; i++) {
		const tmpDistance = ctr.distanceTo(dots[i].pos2);
		distances.push(tmpDistance);
	}
	distances.sort(compareNumbers);

	return ((rad < distances[2]) || (rad > distances[3]));

}

function countOutside (ctr, radius) {

	let count = 0;

	let tmpDistance;
	for (let i=0; i<dots.length;i++) {
		tmpDistance = ctr.distanceTo(dots[i].pos2);
		if (tmpDistance > radius) count++;
	}

	return count;

}

function getRadius (ctr) {

	let distances = [];
	for (let i=0; i<6; i++) {
		const tmpDistance = ctr.distanceTo(dots[i].pos2);
		distances.push(tmpDistance);
	}
	distances.sort(compareNumbers);

	return (distances[2] + 3*distances[3])/4;

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

	}
	getCenter () {

		if (this.circles > 0) return false;

		let ctr3 = new THREE.Vector3();
		let ctr2 = new THREE.Vector2();
		let count, rad, tmpDistance;

		let leftPts = [];
		for (let k1=0; k1<this.left.length; k1++) {
			const tmpPt = dots[this.left[k1]].pos2.clone();
			leftPts.push(tmpPt);
		}
		let mecLeft = welzl(leftPts);
		if (!isNaN(mecLeft.R)) {
			ctr2.copy(mecLeft.C); 
			rad = getRadius(ctr2);
			//console.log("A", mecLeft.R, rad);
			//if (countOutside(ctr2, rad) == 3) {
				if (ctr2.distanceTo(dots[this.left[0]].pos2) < rad) {
					if (ctr2.distanceTo(dots[this.left[1]].pos2) < rad) {
						if (ctr2.distanceTo(dots[this.left[2]].pos2) < rad) {
							this.center2.copy(ctr2);
							this.radius2 = rad;
							return true;
						}
					}
				}
			//} 

		} else {

			let rightPts = [];
			for (let k1=0; k1<this.right.length; k1++) {
				const tmpPt = dots[this.right[k1]].pos2.clone();
				leftPts.push(tmpPt);
			}
			let mecRight = welzl(rightPts);
			if (!isNaN(mecRight.R)) {
				ctr2.copy(mecRight.C);
				rad = getRadius(ctr2); 
				//console.log("A", mecLeft.R, rad);
				//if (countOutside(ctr2, rad) == 3) {
					if (ctr2.distanceTo(dots[this.right[0]].pos2) < rad) {
						if (ctr2.distanceTo(dots[this.right[1]].pos2) < rad) {
							if (ctr2.distanceTo(dots[this.right[2]].pos2) < rad) {
								this.center2.copy(ctr2);
								this.radius2 = rad;
								return true;
							}
						}
					}
				//} 
			}
		}
		return false;
	}

}

function dgEqual (dg1, dg2) {

	if ((dg1.left[1] == dg2.left[1]) && (dg1.left[2] == dg2.left[2]) && (dg1.left[3] == dg2.left[3])) {
		return true;
	} else if ((dg1.right[1] == dg2.right[1]) && (dg1.right[2] == dg2.right[2]) && (dg1.right[3] == dg2.right[3])) {
		return true;
	} else {
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
	boundingradius = 0;
	
    for (let i = 0; i < 6; i++) {

		dotMat.transparent = false;
		tmpDot = new dot(dotGeom, dotMat);
		dots.push(tmpDot);
		
		tmpDot.position.x = Math.cos(1+i*Math.random());
		tmpDot.position.y = Math.cos(2+i*Math.random());
		tmpDot.position.z = Math.cos(3+i*Math.random());
		tmpDot.position.normalize();
		if (tmpDot.position.z == 1) {
			tmpDot.position.z -= 0.01;
			tmpDot.position.normalize();
		}
		tmpDot.pos2.x = tmpDot.position.x / (1 - tmpDot.position.z);
		tmpDot.pos2.y = tmpDot.position.y / (1 - tmpDot.position.z);
		tmpDot.position.setLength(20);

		const tmpMag2 = Math.sqrt(Math.pow(tmpDot.pos2.x,2)+Math.pow(tmpDot.pos2.y,2));
		boundingradius = 0.9 * Math.max(boundingradius,tmpMag2);

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

const setCircles = () => {
	
	let tmpCircle, torusGeom, torusMat, tmpPt2, tmpPt3, ctr2, ctr3, pnt2, pnt3, rad2, rad3, radius2;
	ctr2 = new THREE.Vector2();
	pnt2 = new THREE.Vector2();
	tmpPt2 = new THREE.Vector2();
	pnt3 = new THREE.Vector3();
	tmpPt3 = new THREE.Vector3();
	
	for (let i=0; i<10; i++) {

		if (dotGroups[i].getCenter()) {

			dotGroups[i].circles = 1;

			ctr2.copy(dotGroups[i].center2);
			radius2 = dotGroups[i].radius2;
			//console.log("C", ctr2,radius2);
			let tmpMag = ctr2.length();
			if (tmpMag < 0.1) {
				pnt2.x = ctr2.x + radius2;
				pnt2.y = ctr2.y;
			} else {
				pnt2.x = ctr2.x * (tmpMag + radius2) / tmpMag;
				pnt2.y = ctr2.y * (tmpMag + radius2) / tmpMag;
			}
			rad2 = pnt2.clone();
			rad2.addScaledVector(ctr2,-1);
			tmpPt2 = ctr2.clone();
			tmpPt2.addScaledVector(rad2,-1);
			pnt3.x = (2 * pnt2.x)/(1 + Math.pow(pnt2.x,2) + Math.pow(pnt2.y,2));
			pnt3.y = (2 * pnt2.y)/(1 + Math.pow(pnt2.x,2) + Math.pow(pnt2.y,2));
			pnt3.z = (-1 + Math.pow(pnt2.x,2) + Math.pow(pnt2.y,2))/(1 + Math.pow(pnt2.x,2) + Math.pow(pnt2.y,2));
			pnt3.setLength(20);
			tmpPt3.x = (2 * tmpPt2.x)/(1 + Math.pow(tmpPt2.x,2) + Math.pow(tmpPt2.y,2));
			tmpPt3.y = (2 * tmpPt2.y)/(1 + Math.pow(tmpPt2.x,2) + Math.pow(tmpPt2.y,2));
			tmpPt3.z = (-1 + Math.pow(tmpPt2.x,2) + Math.pow(tmpPt2.y,2))/(1 + Math.pow(tmpPt2.x,2) + Math.pow(tmpPt2.y,2));
			tmpPt3.setLength(20);
			rad3 = pnt3.clone();
			rad3.addScaledVector(tmpPt3,-1);
			let radius3 = rad3.length() * 0.5;
			rad3.setLength(radius3);
			ctr3 = rad3.clone();
			ctr3.addScaledVector(tmpPt3,1);

			torusGeom = new THREE.TorusGeometry(radius3,0.2,12,60);
			torusMat = new THREE.MeshBasicMaterial({ color: 0x202020 });
			tmpCircle = new circle(torusGeom, torusMat);
			tmpCircle.center2.copy(ctr2);
			tmpCircle.point2.copy(pnt2);
			tmpCircle.center3.copy(ctr3);
			tmpCircle.point3.copy(pnt3);
			tmpCircle.radvec2.copy(rad2);
			tmpCircle.radvec3.copy(rad3);
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

const updateCircles = () => {

	let tmpCircle, torusGeom, torusMat, tmpPt2, tmpPt3, ctr2, ctr3, pnt2, pnt3, rad2, rad3, radius2;
	tmpPt2 = new THREE.Vector2();
	tmpPt3 = new THREE.Vector3();
	ctr2 = new THREE.Vector2();
	pnt2 = new THREE.Vector2();
	pnt3 = new THREE.Vector3();
	let removedCircles = false;

	for (let i=0; i<circles.length; i++) {

		const oldrad2 = circles[i].radvec2.length();
		if (notThreeInside(circles[i].center2, oldrad2)) { 

			scene1.remove(circles[i]);
			circleGeoms[i].dispose();
			let currDg = circles[i].dg;
			circles.splice(i,1);
			circleGeoms.splice(i,1);

			dotGroups[currDg].circles--;
			removedCircles = true;
		}
	}
	
	for (let i=0; i<10; i++) {

		if (dotGroups[i].circles < 1) {
			if (dotGroups[i].getCenter()) {

				dotGroups[i].circles = 1;

				ctr2.copy(dotGroups[i].center2);
				radius2 = dotGroups[i].radius2;
				//console.log("D", ctr2,radius2);
				let tmpMag = ctr2.length();
				if (tmpMag < 0.1) {
					pnt2.x = ctr2.x + radius2;
					pnt2.y = ctr2.y;
				} else {
					pnt2.x = ctr2.x * (tmpMag + radius2) / tmpMag;
					pnt2.y = ctr2.y * (tmpMag + radius2) / tmpMag;
				}
				rad2 = pnt2.clone();
				rad2.addScaledVector(ctr2,-1);
				tmpPt2 = ctr2.clone();
				tmpPt2.addScaledVector(rad2,-1);
				pnt3.x = (2 * pnt2.x)/(1 + Math.pow(pnt2.x,2) + Math.pow(pnt2.y,2));
				pnt3.y = (2 * pnt2.y)/(1 + Math.pow(pnt2.x,2) + Math.pow(pnt2.y,2));
				pnt3.z = (-1 + Math.pow(pnt2.x,2) + Math.pow(pnt2.y,2))/(1 + Math.pow(pnt2.x,2) + Math.pow(pnt2.y,2));
				pnt3.setLength(20);
				tmpPt3.x = (2 * tmpPt2.x)/(1 + Math.pow(tmpPt2.x,2) + Math.pow(tmpPt2.y,2));
				tmpPt3.y = (2 * tmpPt2.y)/(1 + Math.pow(tmpPt2.x,2) + Math.pow(tmpPt2.y,2));
				tmpPt3.z = (-1 + Math.pow(tmpPt2.x,2) + Math.pow(tmpPt2.y,2))/(1 + Math.pow(tmpPt2.x,2) + Math.pow(tmpPt2.y,2));
				tmpPt3.setLength(20);
				rad3 = pnt3.clone();
				rad3.addScaledVector(tmpPt3,-1);
				let radius3 = rad3.length() * 0.5;
				rad3.setLength(radius3);
				ctr3 = rad3.clone();
				ctr3.addScaledVector(tmpPt3,1);

				torusGeom = new THREE.TorusGeometry(radius3,0.2,12,60);
				torusMat = new THREE.MeshBasicMaterial({ color: 0x202020 });
				tmpCircle = new circle(torusGeom, torusMat);
				tmpCircle.center2.copy(ctr2);
				tmpCircle.point2.copy(pnt2);
				tmpCircle.center3.copy(ctr3);
				tmpCircle.point3.copy(pnt3);
				tmpCircle.radvec2.copy(rad2);
				tmpCircle.radvec3.copy(rad3);
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
	
	//for (let jj=0; jj< circles.length; jj++) {
		//console.log(jj, circles[jj].dg);
	//}

}

const guiObj = {
	sphereColor: 0x9b66e6,
	sphereOpacity: 0.9,
	dotColor: 0x112211
}
gui.addColor(guiObj, 'sphereColor').onChange( value => {
	baseMesh.material.color.set(value);
} );
gui.add(guiObj, 'sphereOpacity', 0, 1).onChange( value => {
	baseMesh.material.opacity = value;
} );
gui.addColor(guiObj, 'dotColor').onChange( value => {
	for (let j=0; j<dots.length; j++) {
		dots[j].material.color.set(value);
	}
} );

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
	requestAnimationFrame(render.bind(this))
	  
	updateDotPositionTable();
  
}

setScene();

