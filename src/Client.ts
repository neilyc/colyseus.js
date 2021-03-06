import * as msgpack from "msgpack-lite";
import { Signal } from "signals.js";

import { Protocol } from "./Protocol";
import { Room } from "./Room";
import { Connection } from "./Connection";

export class Client {
    public id?: string;

    // signals
    public onOpen: Signal = new Signal();
    public onMessage: Signal = new Signal();
    public onClose: Signal = new Signal();
    public onError: Signal = new Signal();

    protected connection: Connection;

    protected rooms: {[id: string]: Room} = {};
    protected connectingRooms: {[id: string]: Room} = {};
    protected joinRequestId = 0;

    protected hostname: string;
    protected storage: Storage = window.localStorage;

    constructor (url: string) {
        this.hostname = url;
        let colyseusid: any = this.storage.getItem('colyseusid');

        if (!(colyseusid instanceof Promise)) {
            // browser has synchronous return
            this.createConnection(colyseusid);

        } else {
            // react-native is asynchronous
            colyseusid.then(id => this.createConnection(id));
        }
    }

    protected createConnection (colyseusid: string) {
        this.id = colyseusid || "";

        this.connection = new Connection(`${ this.hostname }/?colyseusid=${ this.id }`);
        this.connection.onmessage = this.onMessageCallback.bind(this);
        this.connection.onclose = (e) => this.onClose.dispatch();
        this.connection.onerror = (e) => this.onError.dispatch();

        // check for id on cookie
        this.connection.onopen = () => {
            if (this.id) {
                this.onOpen.dispatch();
            }
        }
    }

    join<T> (roomName: string, options: any = {}): Room<T> {
        options.requestId = ++this.joinRequestId;

        this.connectingRooms[ options.requestId ] = new Room<T>(roomName);

        this.connection.send([Protocol.JOIN_ROOM, roomName, options]);

        return this.connectingRooms[ options.requestId ];
    }

    /**
     * @override
     */
    protected onMessageCallback (event) {
        let message = msgpack.decode( new Uint8Array(event.data) );
        let code = message[0];

        if (code == Protocol.USER_ID) {
            this.storage.setItem('colyseusid', message[1]);

            this.id = message[1];
            this.onOpen.dispatch();

        } else if (code == Protocol.JOIN_ROOM) {
            let requestId = message[2];
            let room = this.connectingRooms[ requestId ];

            this.rooms[room.id] = room;

            room.id = message[1];
            room.connect(new Connection(`${ this.hostname }/${ room.id }?colyseusid=${ this.id }`));
            room.onLeave.add(() => delete this.rooms[room.id]);

            delete this.connectingRooms[ requestId ];

        } else if (code == Protocol.JOIN_ERROR) {
            console.error("server error:", message[2]);

            // general error
            this.onError.dispatch(message[2]);

        } else {
            this.onMessage.dispatch(message);
        }

    }

}
