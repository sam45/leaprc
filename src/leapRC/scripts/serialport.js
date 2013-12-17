var application_stopped = false;

/**
 * Setup the serial port
 */
var SerialPort = require('serialport').SerialPort;
var arduinoPort = 'COM3';
var arduinoSerial;
var controller = new Leap.Controller({enableGestures: true});

var gui = global.window.nwDispatcher.requireNwGui();
var win = gui.Window.get(); // Get the current window
var throttle = yaw = pitch = trim = 0;
var stop = 0;
var inRange = 0;

var WebSocketServer = require('ws').Server
    , wss = new WebSocketServer({port: 8081});
wss.on('connection', function (ws) {
    ws.on('message', function (message) {
        //console.log('received: %s', message);
        inRange = message;
    });
});

var state = new CanvasState(document.getElementById('canvas'));

var connectArduino = function () {
    arduinoSerial = new SerialPort(arduinoPort);
    $('#connectedPort').html('Not connected!'); // set the port name label
    /**
     * Wait for connection
     */
    arduinoSerial.on('open', function () {
        console.log('Serial port open');
        $('#connectedPort').html('Connected to: ' + arduinoPort); // set the port name label

        /**
         * The Arduino will send data when it's ready to receive the control bits
         */
        arduinoSerial.on('data', function (data) {
            // send data
            if (application_stopped) {
                arduinoSerial.write(String.fromCharCode(63));   // yaw
                arduinoSerial.write(String.fromCharCode(63));   // pitch
                arduinoSerial.write(String.fromCharCode(0));  // throttle
                arduinoSerial.write(String.fromCharCode(63));   // trim
            } else {
                trim = $('#sldTrim').val();
                arduinoSerial.write(String.fromCharCode(yaw));   // yaw
                arduinoSerial.write(String.fromCharCode(pitch));   // pitch
                arduinoSerial.write(String.fromCharCode(throttle));  // throttle
                arduinoSerial.write(String.fromCharCode(trim));   // trim
            }

            state.setThrottle(throttle / 127);
            state.setYaw(yaw / 127);
            state.setPitch(pitch / 127);
        });
    });

    /**
     * The serial connection is closed
     */
    arduinoSerial.on('close', function () {
        if (!application_stopped) {
            reconnectArduino();
        }
    });
}

// check for connection errors or drops and reconnect
var reconnectArduino = function () {
    console.log('reconnecting');
    connectArduino();
};

/**
 * Stop the helicopter and close the window
 */
$('#btnExitApp').on('click', function (e) {
    window.close();
});

/**
 * Listen to main window's close event
 */
win.on('close', function () {
    this.hide(); // Pretend to be closed already
    application_stopped = true;

    // the timeout is needed to execute all commands
    setTimeout(function () {
        try {
            arduinoSerial.close();
        } catch (err) {
        } finally {
            gui.App.quit();
        }

    }, 2000);
});

win.on('blur', function () {
    console.log('lost focus');
});

win.on('focus', function () {
    console.log('focus');
});

win.on('closed', function () {
    win = null;
})

/**
 * Data recieved from the Leap Motion
 */
controller.on('frame', function (frame) {

    // Execute code when there is at least 1 hand registered
    if (frame.hands && frame.hands.length > 0 && frame.fingers.length > 1 && inRange == 1) {
        $('#debug1').val('busy');
        var hand = frame.hands[0];

        var x = hand.palmNormal[0];
        // Yaw control
        if (x < 0.15 && x > -0.15) {
            x = 0;
        } else if (x <= -0.9) {
            x = -0.9;
        } else if (x >= 0.9) {
            x = 0.9;
        }

        yaw = 127 - linearScaling(-0.9, 0.9, 0, 127, x);

        // Pitch control
        var z = hand.palmNormal[2];
        if (z <= -0.9) {
            z = -0.9;
        } else if (z >= 0.9) {
            z = 0.9;
        }
        pitch = 127 - linearScaling(-0.9, 0.9, 0, 127, z);

        // Throttle control
        var height = hand.palmPosition[1];
        if (height < 90) {
            throttle = 0;
            yaw = pitch = trim = 63;
        } else if (height > 340) {
            throttle = 127;
        } else {
            throttle = linearScaling(90, 340, 0, 127, height);
        }
        stop = throttle;

        state.setThrottle(throttle / 127);
        state.setYaw(yaw / 127);
        state.setPitch(pitch / 127);
    }

    // detect fist
    if (typeof frame.hands == 'undefined' || frame.fingers.length <= 1 || inRange == 0) {
        if (stop > 65) {
            stop = 65;
        }
        stop -= (stop / 250);
        if (stop <= 15) {
            stop = 0;
        }

        throttle = stop;
        yaw = pitch = 63;


        state.setThrottle(throttle / 127);
        state.setYaw(yaw / 127);
        state.setPitch(pitch / 127);
    }

});

/**
 * @see http://stackoverflow.com/questions/15254280/linearly-scaling-a-number-in-a-certain-range-to-a-new-range
 * @returns {value between a specific range}
 */
function linearScaling(oldMin, oldMax, newMin, newMax, oldValue) {
    var newValue;
    if (oldMin !== oldMax && newMin !== newMax) {
        newValue = parseFloat((((oldValue - oldMin) * (newMax - newMin)) / (oldMax - oldMin)) + newMin);
        newValue = newValue.toFixed(0);
    }
    else {
        newValue = error;
    }
    return newValue;
}

$('#btnChangePort').on('click', function (e) {
    // close the current serial connection and open a new one
    arduinoPort = $('#fldCustomSerialPort').val() !== '' ? $('#fldCustomSerialPort').val() : 'COM4';
    // @TODO check if port is really closed
    try {
        arduinoSerial.close();
    } catch (err) {
    }
    reconnectArduino();
});

// connect the Leap Motion & Arduino
connectArduino();
controller.connect();