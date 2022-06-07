import {AsteroidDTO, BulletDTO, GameDataDTO, PlayerDTO} from "../shared/DTOs"
import P5Functions from "./P5Functions"
import Utils from "../shared/Utils"
import {RGBColor} from "react-color"
import {Constants} from "../shared/Constants"
import * as THREE from 'three'
import { Camera, Scene } from "three"
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer"



export class ViewPort {
    viewSize : number = 0
    aspectRatio : number = 0
    left : number = 0
    right : number = 0
    top : number = 0
    bottom : number = 0
    near : number = -1000
    far : number = 1000
}

export class ClientGameData {
    private readonly p5: P5Functions
    private readonly players: ClientPlayer[] = []
    private readonly bullets: ClientBullet[] = []
    readonly asteroids: ClientAsteroid[] = []

    enableDrawing : boolean = true

    // properties used for camera following player effect
    readonly playerViewScaleRatio = 3.6
    private playerViewMinX: number = 0
    private playerViewMaxX: number = 0
    private playerViewMinY: number = 0
    private playerViewMaxY: number = 0

    private cameraX: number = 0
    private cameraY: number = 0

    private readonly minimapScaleFactor = 0.2

    // properties for displaying 'Points'
    private readonly pointsVerticalSpacing = 200
    private readonly pointsHorizontalSpacing1 = 600
    private readonly pointsHorizontalSpacing2 = 400
    private readonly pointsTextSize = 100
    private readonly labelNickname = 'Name'
    private readonly labelAsteroidPoint = 'Asteroid'
    private readonly labelKillingPoint = 'PK'

    private readonly scene : THREE.Scene
    private readonly camera : THREE.Camera


    private width = 0
    private height = 0

    constructor(p5: P5Functions, scene : THREE.Scene, camera : THREE.Camera) {
        this.p5 = p5
        this.scene = scene
        this.camera = camera
    }

    // update client data with new server data
    update(newData: GameDataDTO, 
           myId: string | null,
           viewport : ViewPort,
           scoresDivs : HTMLDivElement[],
           scoresLabels : CSS2DObject[]) {
        Utils.updateArrayData(this.players, newData.players,
            (e, n) => e.id === n.id,
            (e, n) => e.update(n),
            n => new ClientPlayer(n, this.p5, this.scene, this.camera),
            e => e.remove()
        )

        Utils.updateArrayData(this.bullets, newData.bullets,
            (e, n) => e.id === n.id,
            (e, n) => e.update(n),
            n => new ClientBullet(n, this.p5, this.scene, this.camera),
            e => e.remove()
        )

        Utils.updateArrayData(this.asteroids, newData.asteroids,
            (e, n) => e.id === n.id,
            (e, n) => e.update(n),
            n => new ClientAsteroid(n, this.p5, this.camera, this.scene),
            e => e.remove()
        )

        if (this.width != newData.width || this.height != newData.height) {
            this.playerViewMinX = newData.width / 2 / this.playerViewScaleRatio
            this.playerViewMaxX = newData.width - this.playerViewMinX
            this.playerViewMinY = newData.height / 2 / this.playerViewScaleRatio
            this.playerViewMaxY = newData.height - this.playerViewMinY

            this.width = newData.width
            this.height = newData.height

        }

        // if 'I' am playing, keep me in the center of the canvas
        // else, show the whole canvas
        const me = this.players.find(player => myId === player.id)
        if (me) {
            const midExtent = (low:number, high:number, value : number, extent: number) => {
                const mid = (high - low) / 2
                if (value < mid) {
                    return mid
                } else if (value > extent - mid) {
                    return extent - mid
                } else {
                    return value
                }
            }
            this.cameraX = midExtent(viewport.left, viewport.right, me.x, this.width)
            this.cameraY = -1 * midExtent(viewport.bottom, viewport.top, me.y, this.height)
            this.camera.position.x = this.cameraX
            this.camera.position.y = this.cameraY
        }

        const textSize = this.pointsTextSize
        const count = Math.min(this.players.length, 7) // show max 7 players' points

        for(let i = 0; i < scoresDivs.length; i++) {
            scoresDivs[i].innerText = "";
        }

        if (count > 0) {
            // draw header
            scoresDivs[0].innerText = this.labelNickname;
            scoresDivs[1].innerText = this.labelAsteroidPoint;
            scoresDivs[2].innerText = this.labelKillingPoint;
        }

        for (let i = 0; i < count; i++) {
            const player = this.players[i]
            scoresDivs[3+i*3].innerText = player.name;
            scoresDivs[4+i*3].innerText = "" + player.asteroidPoints;
            scoresDivs[5+i*3].innerText = "" + player.killingPoints;
        }
        const viewport_width = (viewport.right-viewport.left)
        const viewport_height = (viewport.top-viewport.bottom)
        let y_index = -1;
        let x_index = 0;
        let base_label_x = this.camera.position.x + viewport.left + 0.10*viewport_width;
        let base_label_y = this.camera.position.y + viewport.top - 0.10*viewport_height;
        for(let i = 0; i < scoresLabels.length; i++) {
            x_index = i % 3;
            if(x_index == 0) { y_index += 1}
            let this_label_x = base_label_x + x_index*0.08*viewport_width;
            let this_label_y = base_label_y - y_index*0.05*viewport_height;
            
            scoresLabels[i].position.set(this_label_x, 
                                         this_label_y,
                                         0)
        }
    }

    draw(myId: string | null): void {
        if(!this.enableDrawing) { return; }
        const p5 = this.p5
        p5.background(0)

        p5.save()

        // if 'I' am playing, keep me in the center of the canvas
        // else, show the whole canvas
        const me = this.players.find(player => myId === player.id)
        if (me) {
            p5.translate(p5.width / 2, p5.height / 2)
            p5.scale(this.playerViewScaleRatio)
            const x = Math.min(Math.max(me.x, this.playerViewMinX), this.playerViewMaxX)
            const y = Math.min(Math.max(me.y, this.playerViewMinY), this.playerViewMaxY)
            p5.translate(-x, -y)
        }

        for (let player of this.players) {
            player.draw()
        }

        for (let bullet of this.bullets) {
            bullet.draw()
        }

        for (let asteroid of this.asteroids) {
            asteroid.draw()
        }

        p5.restore()

        // draw minimap at bottom-right corner of the canvas
        p5.save()
        p5.translate(p5.width, p5.height)
        const minimapWidth = p5.width * this.minimapScaleFactor
        const minimapHeight = p5.height * this.minimapScaleFactor
        p5.translate(-minimapWidth, -minimapHeight)
        p5.fill(0)
        p5.stroke(255)
        p5.strokeWeight(8)
        p5.rect(0, 0, minimapWidth, minimapHeight)
        for (let player of this.players) {
            player.drawMinimapVersion(this.minimapScaleFactor, player.id === (me && me.id))
        }
        p5.restore()

        // draw player points at top-left corner of the canvas if more than one player exists
        const players = this.players
        players.sort((a, b) => (b.asteroidPoints + b.killingPoints * 2) - (a.asteroidPoints + a.killingPoints * 2))
        p5.save()
        p5.translate(400, 200)
        const verticalSpacing = this.pointsVerticalSpacing
        const horizontalSpacing1 = this.pointsHorizontalSpacing1
        const horizontalSpacing2 = this.pointsHorizontalSpacing2
        const textSize = this.pointsTextSize
        const count = Math.min(players.length, 7) // show max 7 players' points

        if (count > 0) {
            // draw header
            p5.save()
            p5.fill(255)
            p5.text(this.labelNickname, 0, 0, textSize)
            p5.translate(horizontalSpacing1, 0)
            p5.text(this.labelAsteroidPoint, 0, 0, textSize)
            p5.translate(horizontalSpacing2, 0)
            p5.text(this.labelKillingPoint, 0, 0, textSize)
            p5.restore()
        }

        for (let i = 0; i < count; i++) {
            const player = players[i]
            p5.save()
            p5.translate(0, verticalSpacing * (i + 1))
            if (i === 0) {
                p5.fill(255, 0, 0)
            } else {
                p5.fill(255)
            }
            p5.text(player.name, 0, 0, textSize)
            p5.translate(horizontalSpacing1, 0)
            p5.text(`${player.asteroidPoints}`, 0, 0, textSize)
            p5.translate(horizontalSpacing2, 0)
            p5.text(`${player.killingPoints}`, 0, 0, textSize)
            p5.restore()
        }
        p5.restore()
    }
}

const asteroidMaterial = new THREE.MeshBasicMaterial( { color: 0xffffff } );

function createPlaneGeometry(vertices : number[][], material : THREE.MeshBasicMaterial) {

    const shape = new THREE.Shape()
    shape.moveTo(vertices[0][0], vertices[0][1])
    for (let vertex of vertices.slice(1)) {
        shape.lineTo(vertex[0], vertex[1])
    }

    const geometry = new THREE.ShapeGeometry( shape );
    const mesh = new THREE.Mesh( geometry, material ) ;
    
	// Write the code to generate minimum number of faces for the polygon.
	// Return the geometry object
	return mesh;
}

export class ClientPlayer {
    readonly id: string
    readonly name: string
    private readonly size: number
    private readonly vertices: number[][]
    private readonly nameOffset: number

    private readonly tailSize: number
    private readonly tailMinRotation = Constants.QUARTER_PI
    private readonly tailMaxRotation = 3 * Constants.QUARTER_PI

    private mesh : THREE.Mesh
    private scene : THREE.Scene
    private camera : THREE.Camera

    private color: RGBColor
    x: number
    y: number
    private heading: number
    private showTail: boolean

    asteroidPoints: number
    killingPoints: number


    private readonly p5: P5Functions

    constructor(dto: PlayerDTO, p5: P5Functions, scene: Scene, camera: Camera) {
        this.id = dto.id
        this.name = dto.name
        this.size = dto.size
        this.vertices = dto.vertices
        this.nameOffset = -this.size * 2
        this.tailSize = this.size * 1.3

        this.color = dto.color
        this.x = dto.x
        this.y = dto.y
        this.heading = dto.heading
        this.showTail = dto.showTail

        this.asteroidPoints = dto.asteroidPoints
        this.killingPoints = dto.killingPoints

        this.scene = scene
        this.camera = camera
        this.mesh = createPlaneGeometry(this.vertices, asteroidMaterial)

        this.scene.add(this.mesh)

        this.p5 = p5
    }

    remove() : void {
        this.scene.remove(this.mesh)
    }

    update(newData: PlayerDTO): void {
        this.x = newData.x
        this.y = newData.y
        this.color = newData.color
        this.heading = newData.heading
        this.showTail = newData.showTail
        this.asteroidPoints = newData.asteroidPoints
        this.killingPoints = newData.killingPoints

        this.mesh.position.x = newData.x
        this.mesh.position.y = -newData.y
        this.mesh.rotation.z = -(this.heading+Constants.HALF_PI)
    }

    draw(): void {

        const p5 = this.p5
        p5.save()
        p5.translate(this.x, this.y)

        // write name above
        p5.save()
        p5.translate(0, this.nameOffset)
        p5.fill(255)
        p5.text(this.name, 0, 0, 24)
        p5.restore()

        const color = this.color
        p5.fill(color.r, color.g, color.b)
        p5.stroke(color.r, color.g, color.b)

        p5.rotate(this.heading - Constants.HALF_PI)
        const vertices = this.vertices
        p5.triangle(vertices[0][0], vertices[0][1],
            vertices[1][0], vertices[1][1],
            vertices[2][0], vertices[2][1])

        if (this.showTail) {
            p5.save()
            p5.stroke(color.r, color.g, color.b)
            p5.strokeWeight(3)
            p5.translate(0, this.size)
            p5.rotate(Utils.map(Math.random(), 0, 1, this.tailMinRotation, this.tailMaxRotation))
            p5.line(0, 0, this.tailSize, 0)
            p5.restore()
        }

        p5.restore()
    }

    drawMinimapVersion(scaleFactor: number, isMe: boolean): void {
        const p5 = this.p5
        p5.save()
        p5.translate(this.x * scaleFactor, this.y * scaleFactor)

        const color = this.color
        const size = this.size * scaleFactor * 12
        p5.fill(color.r, color.g, color.b)
        p5.stroke(color.r, color.g, color.b)
        p5.ellipse(0, 0, size, size)

        if (isMe) {
            p5.fill(255, 0, 0)
            p5.text('🌟', 0, 0, 80)
        }

        p5.restore()
    }
}

export class ClientBullet {
    readonly id: string
    readonly vertices: number[][]
    private readonly size: number = 5
    readonly threejs_vertices: number[][] = [[-this.size, -this.size], 
                                             [ this.size, -this.size],
                                             [ this.size,  this.size],
                                             [-this.size,  this.size]
                                            ]
    x: number
    y: number
    heading: number
    color: RGBColor

    private mesh : THREE.Mesh
    private scene : THREE.Scene
    private camera : THREE.Camera
    private readonly p5: P5Functions

    constructor(data: BulletDTO, p5: P5Functions, scene: Scene, camera: Camera) {
        this.id = data.id
        this.heading = data.heading
        this.x = data.x
        this.y = data.y
        this.vertices = data.vertices
        this.color = data.color
        this.scene = scene
        this.camera = camera
        
        this.mesh = createPlaneGeometry(this.threejs_vertices, asteroidMaterial)
        this.scene.add(this.mesh)
        this.p5 = p5
    }

    remove() : void {
        this.scene.remove(this.mesh)
    }

    update(data: BulletDTO) {
        this.x = data.x
        this.y = data.y
        this.heading = data.heading
        this.color = data.color
        this.mesh.position.x = this.x
        this.mesh.position.y = -this.y
        this.mesh.rotation.z = -this.heading
    }

    draw() {
        const p5 = this.p5
        p5.save()
        p5.translate(this.x, this.y)
        p5.rotate(this.heading - Constants.HALF_PI)
        p5.noFill()
        p5.stroke(this.color.r, this.color.g, this.color.b)
        p5.strokeWeight(5)
        p5.beginShape()
        const vertices = this.vertices
        p5.vertex(vertices[0][0], vertices[0][1])
        p5.vertex(vertices[1][0], vertices[1][1])
        p5.endShape()
        p5.restore()
    }
}


export class ClientAsteroid {
    readonly id: string
    readonly vertices: number[][]
    private x: number
    private y: number
    private rotation: number
    private mesh : THREE.Mesh
    private scene : THREE.Scene

    private readonly p5: P5Functions

    constructor(dto: AsteroidDTO, p5: P5Functions, camera: Camera, scene: Scene) {
        this.id = dto.id
        this.vertices = dto.vertices
        this.x = dto.x
        this.y = dto.y
        this.rotation = dto.rotation
        this.mesh = createPlaneGeometry(this.vertices, asteroidMaterial)
        this.scene = scene

        scene.add(this.mesh)

        this.p5 = p5
    }

    remove() : void {
        this.scene.remove(this.mesh)
    }

    update(newData: AsteroidDTO): void {
        this.x = newData.x
        this.y = newData.y
        this.rotation = newData.rotation
        this.mesh.position.x = this.x
        this.mesh.position.y = -this.y
        this.mesh.rotation.z = -(this.rotation)
    }

    draw(): void {
        const p5 = this.p5
        p5.save()
        p5.translate(this.x, this.y)
        p5.rotate(this.rotation)
        p5.fill(255)
        p5.stroke(255)
        p5.beginShape()
        for (let vertex of this.vertices) {
            p5.vertex(vertex[0], vertex[1])
        }
        p5.endShape()
        p5.restore()
    }
}

