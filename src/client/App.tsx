import React, {createRef} from 'react'
import {withSnackbar, WithSnackbarProps} from "notistack"
import io from 'socket.io-client'
import P5Functions from "./P5Functions"
import * as THREE from 'three'
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import {ClientGameData, ViewPort} from "./ClientModels"
import {ClientSocketEventsHelper} from "./ClientSocketEventsHelper"
import {GameDataDTO, PlayerDTO, PlayerInputDTO} from "../shared/DTOs"
import {RGBColor} from "react-color"
import LogInView from "./LogInView"
import './App.css'
import { Vector3 } from 'three'
import GUI from 'lil-gui'

interface Props extends WithSnackbarProps {}

interface State {
    // my player instance id
    // null if my player instance doesn't exist (e.g. didn't log in yet, dead etc)
    myId: string | null
    fitScreenHeight: boolean
    threeJSGameVisible: boolean
}

class App extends React.Component<Props, State> implements P5Functions {
    private readonly socket: SocketIOClient.Emitter

    private scene : THREE.Scene = new THREE.Scene()
    //private camera : THREE.PerspectiveCamera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)
    private camera : THREE.OrthographicCamera = new THREE.OrthographicCamera(
        -2,
         2,
         2,
        -2,
        0.1, 1000
    )
    private readonly renderer = new THREE.WebGLRenderer()
    private readonly labelRenderer

    private readonly scoresDivs : HTMLDivElement[] = []
    private readonly scoresLabels : CSS2DObject[] = []

    private readonly nameDivs : HTMLDivElement[] = []
    private readonly nameLabels : CSS2DObject[] = []

    private geometry = new THREE.BoxGeometry(100,100,100)
    private material = new THREE.MeshBasicMaterial({
        color: 0x00ff00,
        wireframe: true,
    })
    private cube = new THREE.Mesh(this.geometry, this.material)


    private gui = new GUI()

    private _viewport = new ViewPort()

    private debugData = {
        cubex : 2000,
        cubey: 2000,
        turnOnThreeCanvas: false
    };

    private readonly canvasRef = createRef<HTMLCanvasElement>()
    private canvasContext: CanvasRenderingContext2D | null = null

    private requestAnimationFrameHandler: number | null = null

    width = 0
    height = 0

    // framerate related properties
    private readonly fps = 60
    private readonly interval = 1000 / this.fps
    private now = 0
    private then = Date.now()
    private delta: number = 0

    private readonly currentGameData: ClientGameData = new ClientGameData(this, this.scene, this.camera)

    // keep track of previous login info to provide easier login experience
    private prevLoggedInName: string | null = null
    private prevLoggedInColor: RGBColor | null = null

    private readonly playerInput: PlayerInputDTO = {
        left: false,
        right: false,
        up: false,
        fire: false
    }
    private sendInputLoopHandler: NodeJS.Timeout | null = null
    // send input to the server approx 60fps
    private readonly sendInputInterval = 1000 / 60

    constructor(props: Props) {
        super(props)
        this.socket = io.connect()
        this.state = { myId: null, fitScreenHeight: true, threeJSGameVisible: false }

        this.onAnimationFrame = this.onAnimationFrame.bind(this)
        this.onWindowResizeEvent = this.onWindowResizeEvent.bind(this)
        this.onGameDataEvent = this.onGameDataEvent.bind(this)
        this.onNewPlayerJoinedEvent = this.onNewPlayerJoinedEvent.bind(this)
        this.onKilledByAsteroidEvent = this.onKilledByAsteroidEvent.bind(this)
        this.onOtherPlayerKilledByAsteroidEvent = this.onOtherPlayerKilledByAsteroidEvent.bind(this)
        this.onKilledByPlayerEvent = this.onKilledByPlayerEvent.bind(this)
        this.onOtherPlayerKilledByPlayerEvent = this.onOtherPlayerKilledByPlayerEvent.bind(this)
        this.onLoggedInEvent = this.onLoggedInEvent.bind(this)
        this.onPlayerLeftEvent = this.onPlayerLeftEvent.bind(this)
        this.sendInputLoop = this.sendInputLoop.bind(this)
        this.onKeyDownEvent = this.onKeyDownEvent.bind(this)
        this.onKeyUpEvent = this.onKeyUpEvent.bind(this)

        for(let i = 0; i < 7*3 + 1; i++) {
            const scoresDiv = document.createElement( 'div' );
            scoresDiv.className = 'label';
            scoresDiv.textContent = 'Scores';
            scoresDiv.style.marginTop = '-1em';
            scoresDiv.style.color = 'white';
            scoresDiv.style.zIndex = '10';
            const scoresLabel = new CSS2DObject( scoresDiv );
            scoresLabel.layers.set( 0 );
            this.scene.add( scoresLabel );
            this.scoresDivs[i] = scoresDiv;
            this.scoresLabels[i] = scoresLabel;
        }
        this.labelRenderer = new CSS2DRenderer();
        this.labelRenderer.setSize( window.innerWidth, window.innerHeight );
        this.labelRenderer.domElement.style.position = 'absolute';
        this.labelRenderer.domElement.style.top = '0px';
        this.labelRenderer.domElement.style.zIndex = '9';
        document.body.appendChild(this.labelRenderer.domElement );
        document.body.appendChild(this.renderer.domElement)

        this.gui.add(this.debugData, 'cubex', 1500, 2500, 10)
        this.gui.add(this.debugData, 'cubey', 1500, 2500, 10)
        this.gui
            .add(this.debugData, 'turnOnThreeCanvas')
            .onFinishChange((value : boolean) => {this.updateThreeJSGameVisibility(value)});
        
        this.scene.add(this.cube)
        this.onWindowResizeEvent()
        this.updateThreeJSGameVisibility(this.state.threeJSGameVisible)
    }

    updateThreeJSGameVisibility(value: boolean) {
        this.setState({threeJSGameVisible : value})
        const elem = this.renderer.domElement
        elem.style.visibility = value ? "visible" : "hidden"
        elem.style.position = "absolute"
        elem.style.top = "0"
        elem.style.left = "0"
        this.currentGameData.enableDrawing = !value
    }

    private threeRender() : void{
        this.labelRenderer.render(this.scene, this.camera)
        this.renderer.render(this.scene, this.camera)
    }

    render() {
        const divStyle = this.state.fitScreenHeight ? 'fitHeight' : 'fitWidth'
        return (
            <div style={{width: "100vw", height: "100vh", backgroundColor: "black"}}>
                <div className={divStyle} style={{position: "relative", visibility: this.state.threeJSGameVisible? "hidden" : "visible"}}>
                    <canvas ref={this.canvasRef} width={this.width} height={this.height}
                            style={{width: "100%", height: "100%", display: "block", border: '2px solid white'}}>
                        Fallback text for old browsers.
                    </canvas>
                    { this.state.myId
                        ? null
                        : <LogInView socket={this.socket}
                                     prevName={this.prevLoggedInName}
                                     prevColor={this.prevLoggedInColor} />
                    }
                </div>
            </div>
        )
    }

    componentDidMount(): void {
        const canvas = this.canvasRef.current
        this.canvasContext = canvas && canvas.getContext('2d')
        if (this.canvasContext) {
            this.requestAnimationFrameHandler = window.requestAnimationFrame(this.onAnimationFrame)
            this.sendInputLoopHandler = setTimeout(this.sendInputLoop, this.sendInputInterval)

            const socket = this.socket
            ClientSocketEventsHelper.subscribeLoggedInEvent(socket, this.onLoggedInEvent)
            ClientSocketEventsHelper.subscribeGameDataEvent(socket, this.onGameDataEvent)
            ClientSocketEventsHelper.subscribeNewPlayerJoinedEvent(socket, this.onNewPlayerJoinedEvent)
            ClientSocketEventsHelper.subscribeKilledByAsteroidEvent(socket, this.onKilledByAsteroidEvent)
            ClientSocketEventsHelper.subscribeOtherPlayerKilledByAsteroidEvent(socket, this.onOtherPlayerKilledByAsteroidEvent)
            ClientSocketEventsHelper.subscribeKilledByPlayerEvent(socket, this.onKilledByPlayerEvent)
            ClientSocketEventsHelper.subscribeOtherPlayerKilledByPlayerEvent(socket, this.onOtherPlayerKilledByPlayerEvent)
            ClientSocketEventsHelper.subscribePlayerLeftEvent(socket, this.onPlayerLeftEvent)

            document.addEventListener('keydown', this.onKeyDownEvent)
            document.addEventListener('keyup', this.onKeyUpEvent)
            window.addEventListener('resize', this.onWindowResizeEvent)

            this.onWindowResizeEvent()
        }
    }

    componentWillUnmount(): void {
        this.canvasContext = null
        if (this.requestAnimationFrameHandler) {
            window.cancelAnimationFrame(this.requestAnimationFrameHandler)
        }
        if (this.sendInputLoopHandler) {
            clearTimeout(this.sendInputLoopHandler)
        }

        document.removeEventListener('keydown', this.onKeyDownEvent)
        document.removeEventListener('keyup', this.onKeyUpEvent)
        window.removeEventListener('resize', this.onWindowResizeEvent)
    }

    private sendInputLoop(): void {
        // send user input to the server
        ClientSocketEventsHelper.sendPlayerInput(this.socket, this.playerInput)
        this.sendInputLoopHandler = setTimeout(this.sendInputLoop, this.sendInputInterval)
    }

    private onKeyDownEvent(event: KeyboardEvent): void {
        if (event.code) {
            switch (event.code) {
                case "ArrowLeft":
                    this.playerInput.left = true
                    break
                case "ArrowRight":
                    this.playerInput.right = true
                    break
                case "ArrowUp":
                    this.playerInput.up = true
                    break
                case 'Space':
                    this.playerInput.fire = true
                    break
            }
        } else {
            // fallback for browsers not supporting event.code
            switch (event.keyCode) {
                case 37:
                    this.playerInput.left = true
                    break
                case 38:
                    this.playerInput.up = true
                    break
                case 39:
                    this.playerInput.right = true
                    break
                case 32:
                    this.playerInput.fire = true
                    break
            }
        }
    }

    private onKeyUpEvent(event: KeyboardEvent): void {
        if (event.code ) {
            switch (event.code) {
                case "ArrowLeft":
                    this.playerInput.left = false
                    break
                case "ArrowRight":
                    this.playerInput.right = false
                    break
                case "ArrowUp":
                    this.playerInput.up = false
                    break
                case 'Space':
                    this.playerInput.fire = false
                    break
            }
        } else {
            // fallback for browsers not supporting event.code
            switch (event.keyCode) {
                case 37:
                    this.playerInput.left = false
                    break
                case 38:
                    this.playerInput.up = false
                    break
                case 39:
                    this.playerInput.right = false
                    break
                case 32:
                    this.playerInput.fire = false
                    break
            }
        }
    }

    private onLoggedInEvent(you: PlayerDTO): void {
        this.setState({myId: you.id})
        this.prevLoggedInName = you.name
        this.prevLoggedInColor = you.color
    }

    private onGameDataEvent(gameData: GameDataDTO): void {
        this.updateCanvasSizeIfChanged(gameData)
        // update client game data (e.g. position, color etc) with server data
        this.currentGameData.update(gameData, 
                                    this.state.myId,
                                    this._viewport,
                                    this.scoresDivs,
                                    this.scoresLabels)
    }

    private onNewPlayerJoinedEvent(player: PlayerDTO): void {
        this.props.enqueueSnackbar(`${player.name} joined game!`,
            { variant: 'success', autoHideDuration: 1500 })
    }

    private onKilledByAsteroidEvent(player: PlayerDTO): void {
        this.setState({myId: null})
    }

    private onOtherPlayerKilledByAsteroidEvent(player: PlayerDTO): void {
        this.props.enqueueSnackbar(`\u2604 \u2694 ${player.name}`,
            { variant: 'info', autoHideDuration: 1500 })
    }

    private onKilledByPlayerEvent(killer: PlayerDTO, killed: PlayerDTO): void {
        this.setState({myId: null})
    }

    private onOtherPlayerKilledByPlayerEvent(killer: PlayerDTO, killed: PlayerDTO): void {
        this.props.enqueueSnackbar(`${killer.name} \u2694 ${killed.name}`,
            { variant: 'info', autoHideDuration: 1500 })
    }

    private onPlayerLeftEvent(playerDTO: PlayerDTO): void {
        this.props.enqueueSnackbar(`${playerDTO.name} left game!`,
            { variant: 'warning', autoHideDuration: 1500 })
    }

    private updateCanvasSizeIfChanged(newData: GameDataDTO): void {
        if (this.height !== newData.height || this.width !== newData.width) {
            const canvas = this.canvasRef.current
            if (canvas) {
                canvas.width = newData.width
                canvas.height = newData.height
                this.width = newData.width
                this.height = newData.height
                this.onWindowResizeEvent()
            }
        }
    }

    private onWindowResizeEvent(): void {
        const w = window.innerWidth
        const h = window.innerHeight
        const aspectRatio = w / h
        console.log("w", w)
        console.log("h", h)
        console.log("game width: ", this.width)
        console.log("aspect ratio", aspectRatio)

        // TODO: Handle cases where height is greater than widths
        const fitHeight = w >= h

        const viewSize = this.width / this.currentGameData.playerViewScaleRatio
        this._viewport.viewSize = viewSize
        console.log("viewSize", viewSize)
        console.log("aspectRatio*viewSize", aspectRatio*viewSize)

        this._viewport.aspectRatio = aspectRatio
        this._viewport.left = -aspectRatio * viewSize / 2
        this._viewport.right = aspectRatio * viewSize / 2
        this._viewport.bottom = -viewSize / 2
        this._viewport.top = viewSize / 2
        this._viewport.near = -1000
        this._viewport.far = 1000

        //this.camera.aspect = w / h
        this.camera.left = this._viewport.left
        this.camera.right = this._viewport.right
        this.camera.top = this._viewport.top
        this.camera.bottom = this._viewport.bottom
        this.camera.position.x = 2000
        this.camera.position.y = -2000
        this.camera.position.z = 100;
        this.camera.updateProjectionMatrix()
        this.camera.lookAt(new Vector3(this.camera.position.x, this.camera.position.y, 0))
        this.renderer.setSize(w, h)
        this.labelRenderer.setSize(w, h)
        this.threeRender()
        if (this.state.fitScreenHeight !== fitHeight) {
            this.setState({fitScreenHeight: fitHeight})
        }
    }


    private onAnimationFrame(): void {
        const ctx = this.canvasContext
        const gameData = this.currentGameData
        if (ctx && gameData && !this.state.threeJSGameVisible) {
            // framerate related logic
            this.now = Date.now()
            this.delta = this.now - this.then

            if (this.delta > this.interval) {
                this.then = this.now - (this.delta % this.interval)

                ctx.clearRect(0, 0, this.width, this.height)
                ctx.save()
                // for anti-aliasing effect (https://stackoverflow.com/questions/4261090/html5-canvas-and-anti-aliasing)
                ctx.translate(0.5, 0.5)

                // do the main drawing of client game data
                gameData.draw(this.state.myId)

                ctx.restore()
            }
        }

        if(this.state.threeJSGameVisible) {
            this.cube.position.x = this.debugData.cubex
            this.cube.position.y = -this.debugData.cubey
            this.cube.position.z = 0
            this.cube.rotation.x += 0.01
            this.cube.rotation.y += 0.01
            this.threeRender()
        }
        this.requestAnimationFrameHandler = window.requestAnimationFrame(this.onAnimationFrame)
    }

    // P5Functions

    background(color: number): void;
    background(r: number, g: number, b: number): void;
    background(r: number, g: number, b: number, a: number): void;
    background(r: number, g?: number, b?: number, a: number = 1.0) {
        const context = this.canvasContext
        if (context) {
            const prevFillStyle = context.fillStyle

            if (g !== undefined && b !== undefined) {
                context.fillStyle = `rgba(${r}, ${g}, ${b}, ${a})`
            } else {
                context.fillStyle = `rgba(${r}, ${r}, ${r}, ${a})`
            }
            context.fillRect(0, 0, this.width, this.height)

            context.fillStyle = prevFillStyle
        }
    }

    stroke(color: number): void;
    stroke(r: number, g: number, b: number): void;
    stroke(r: number, g: number, b: number, a: number): void;
    stroke(r: number, g?: number, b?: number, a: number = 1.0) {
        const context = this.canvasContext
        if (context) {
            if (g !== undefined && b !== undefined) {
                context.strokeStyle = `rgba(${r}, ${g}, ${b}, ${a})`
            } else {
                context.strokeStyle = `rgba(${r}, ${r}, ${r}, ${a})`
            }
        }
    }

    strokeWeight(weight: number) {
        const context = this.canvasContext
        if (context) {
            context.lineWidth = weight
        }
    }

    fill(color: number): void;
    fill(r: number, g: number, b: number): void;
    fill(r: number, g: number, b: number, a: number): void;
    fill(r: number, g?: number, b?: number, a: number = 1.0) {
        const context = this.canvasContext
        if (context) {
            if (g !== undefined && b !== undefined) {
                context.fillStyle = `rgba(${r}, ${g}, ${b}, ${a})`
            } else {
                context.fillStyle = `rgba(${r}, ${r}, ${r}, ${a})`
            }
        }
    }

    noFill() {
        const context = this.canvasContext
        if (context) {
            context.fillStyle = 'rgba(0,0,0,0)'
        }
    }

    ellipse(x: number, y: number, width: number, height: number) {
        const context = this.canvasContext
        if (context) {
            context.beginPath()
            context.ellipse(x, y, width / 2, height / 2, 0, 0, 360)
            context.stroke()
            context.fill()
        }
    }

    translate(x: number, y: number) {
        const context = this.canvasContext
        if (context) {
            context.translate(x, y)
        }
    }

    rotate(radian: number) {
        const context = this.canvasContext
        if (context) {
            context.rotate(radian)
        }
    }

    line(x1: number, y1: number, x2: number, y2: number) {
        const context = this.canvasContext
        if (context) {
            context.beginPath()
            context.moveTo(x1, y1)
            context.lineTo(x2, y2)
            context.stroke()
        }
    }

    beginShape() {
        const context = this.canvasContext
        if (context) {
            context.beginPath()
        }
    }

    endShape() {
        const context = this.canvasContext
        if (context) {
            context.closePath()
            context.stroke()
            context.fill()
        }
    }

    vertex(x: number, y: number) {
        const context = this.canvasContext
        if (context) {
            context.lineTo(x, y)
        }
    }

    triangle(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): void {
        const context = this.canvasContext
        if (context) {
            context.beginPath()
            context.moveTo(x1, y1)
            context.lineTo(x2, y2)
            context.lineTo(x3, y3)
            context.closePath()
            context.stroke()
            context.fill()
        }
    }

    restore(): void {
        const context = this.canvasContext
        if (context) {
            context.restore()
        }
    }

    save(): void {
        const context = this.canvasContext
        if (context) {
            context.save()
        }
    }

    scale(amount: number): void {
        const context = this.canvasContext
        if (context) {
            context.scale(amount, amount)
        }
    }

    text(text: string, x: number, y: number, size: number): void {
        const context = this.canvasContext
        if (context) {
            context.font = `${size}px roboto`
            context.textAlign = 'center'
            context.fillText(text, x, y)
        }
    }

    rect(x1: number, y1: number, w: number, h: number): void {
        const context = this.canvasContext
        if (context) {
            context.fillRect(x1, y1, w, h)
            context.strokeRect(x1, y1, w, h)
        }
    }

    noStroke(): void {
        const context = this.canvasContext
        if (context) {
            context.strokeStyle = 'rgba(0,0,0,0)'
        }
    }
}

export default withSnackbar(App)
