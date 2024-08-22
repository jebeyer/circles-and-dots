import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DragControls } from 'three/addons/controls/DragControls.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

const container = document.querySelector('.container');
const canvas    = document.querySelector('.canvas');

const circlesOutput = document.getElementById("numCirclesOutput");
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
		tmp3.setLength(20);
		event.object.position.copy(tmp3);
		
		updateCircles2();

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
	
    for (let i = 0; i < 6; i++) {

		dotMat.transparent = false;
		tmpDot = new dot(dotGeom, dotMat);
		dots.push(tmpDot);
		
		tmpDot.position.x = Math.random() * 2 - 1;
		tmpDot.position.y = Math.random() * 2 - 1;
		tmpDot.position.z = Math.random() * 2 - 1;
		tmpDot.position.normalize();
		if (tmpDot.position.z == 1) {
			tmpDot.position.z -= 0.01;
			tmpDot.position.normalize();
		}
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
			//ctr3.setLength(20.0*Math.sin(radius3/20.0));

			torusGeom = new THREE.TorusGeometry(radius3,0.2,12,60);
			torusMat = new THREE.MeshBasicMaterial({ color: 0x202020 });
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

const updateCircles2 = () => {

	let tmpCircle, torusGeom, torusMat, ctr3;
	let removedCircles = false;

	for (let i=0; i<circles.length; i++) {

		if (!dotGroups[circles[i].dg].areDotsDivided()) {

			scene1.remove(circles[i]);
			circleGeoms[i].dispose();
			let currDg = circles[i].dg;
			circles.splice(i,1);
			circleGeoms.splice(i,1);

			dotGroups[currDg].circles = 0;
			removedCircles = true;
		}
	}

	for (let i=0; i<10; i++) {

		if (dotGroups[i].circles < 1) {
			if (dotGroups[i].getPlane()) {

				dotGroups[i].circles = 1;

				let radius3 = dotGroups[i].radius3.length();
				let ctr3 = dotGroups[i].center3.clone();

				torusGeom = new THREE.TorusGeometry(radius3,0.2,12,60);
				torusMat = new THREE.MeshBasicMaterial({ color: 0x202020 });
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

const guiObj = {
	autoRotate: false,
	animateDots: false,
	sphereColor: 0x9b66e6,
	sphereOpacity: 0.9,
	dotColor: 0x112211
}
gui.add(guiObj, 'autoRotate').onChange( value => {
	controls.autoRotate = value;
} );
//gui.add(guiObj, 'animateDots');
const colorFolder = gui.addFolder( 'colors' );
colorFolder.addColor(guiObj, 'sphereColor').onChange( value => {
	baseMesh.material.color.set(value);
} );
colorFolder.add(guiObj, 'sphereOpacity', 0, 1).onChange( value => {
	baseMesh.material.opacity = value;
} );
colorFolder.addColor(guiObj, 'dotColor').onChange( value => {
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
	circlesOutput.textContent = circles.length;
  
}

setScene();

