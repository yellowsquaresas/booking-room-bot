// See https://github.com/dialogflow/dialogflow-fulfillment-nodejs
// for Dialogflow fulfillment library docs, samples, and to report issues
'use strict';

const functions = require('firebase-functions');
const {WebhookClient} = require('dialogflow-fulfillment');
const {Card, Suggestion} = require('dialogflow-fulfillment');
const {google} = require('googleapis');
const moment = require('moment-timezone');
moment.tz.setDefault('Europe/Paris');
moment.locale('fr');

const privatekey = require('./secret.json');


process.env.DEBUG = 'dialogflow:debug'; // enables lib debugging statements

exports.dialogflowFirebaseFulfillment = functions.https.onRequest((request, response) => {
    const agent = new WebhookClient({request, response});
    console.log('Dialogflow Request headers: ' + JSON.stringify(request.headers));
    console.log('Dialogflow Request body: ' + JSON.stringify(request.body));

    function welcome(agent) {
        agent.add(`Welcome to my agent!`);
    }

    function fallback(agent) {
        agent.add(`I didn't understand`);
        agent.add(`I'm sorry, can you try again?`);
    }

    // Uncomment and edit to make your own intent handler
    // uncomment `intentMap.set('your intent name here', yourFunctionHandler);`
    // below to get this function to be run when a Dialogflow intent is matched
    function lookupForAMeetingRoom(agent) {

        console.log("lookupForAMeetingRoom function");
        console.log(agent.parameters);

        let date = agent.parameters.date;
        let time = agent.parameters.time;
        let numberOfPersons = agent.parameters.numberOfPersons;
        let duration = agent.parameters.duration;
        agent.add(`Je regarde ce qui est disponible pour le ${moment(date).format("DD MMMM")} à ${moment(time).tz('Europe/Paris').format("HH:mm")}, pour une durée de ${duration.amount} ${duration.unit}...`);

        let meetingsRooms = [
            {id: 1, name: "lion", numberOfPersons: 20},
            //{id: 2, name: "hydre", numberOfPersons: 5},
            {id: 3, name: "sanglier", numberOfPersons: 10},
            {id: 4, name: "biche", numberOfPersons: 10},
            {id: 5, name: "oiseau", numberOfPersons: 5},
            {id: 6, name: "taureau", numberOfPersons: 100},
            {id: 7, name: "jument", numberOfPersons: 10},
            {id: 8, name: "ceinture", numberOfPersons: 10},
            {id: 9, name: "ecurie", numberOfPersons: 10},
            {id: 10, name: "boeuf", numberOfPersons: 10},
            {id: 11, name: "pomme", numberOfPersons: 10},
            {id: 12, name: "chien", numberOfPersons: 50},
        ];

        let jwtClient = new google.auth.JWT(
            privatekey.client_email,
            null,
            privatekey.private_key,
            ['https://www.googleapis.com/auth/calendar.readonly']);

        const dateSearched = moment(date);
        const year = dateSearched.format('YYYY');
        const month = dateSearched.format('MM');
        const day = dateSearched.format("DD");

        const timeSearched = moment(time).tz('Europe/Paris');
        const hour = timeSearched.format("HH");
        const minutes = timeSearched.format("mm");

        const searched = moment(`${year}-${month}-${day} ${hour}:${minutes}`);
        const searchedEnd = moment(`${year}-${month}-${day} ${hour}:${minutes}`).add(duration.amount, duration.unit.charAt(0));
        console.log('SEARCH = ', searched.format());
        console.log('SEARCH END = ', searchedEnd.format());

        const calendar = google.calendar('v3');

        return new Promise((resolve, reject) => {
            calendar.events.list({
                auth: jwtClient,
                calendarId: 'rikeddg9ebiras8ptmstro0um0@group.calendar.google.com',
                //maxResults: 20,
                //orderBy: "startTime",
                timeMin: moment(`${year}-${month}-${day} ${hour}:${minutes}`).format(),
                timeMax: moment(`${year}-${month}-${day} ${hour}:${minutes}`).add(4, 'hours').format(),
                fields: "kind, items(start, end, summary, location)",
                singleEvents: true, // to hack recurring events
            }, function (error, response) {
                // Handle the results here (response.result has the parsed body).
                let busyRooms = [];

                let errors = [];
                if (typeof response != "undefined") {
                    console.log("Response", response.data.items);
                    //console.log("error", response.data.items[0].start);

                    if (response.data && response.data.items) {
                        for (let index in response.data.items) {
                            let event = response.data.items[index];
                            // using UTC time here to avoid timezone issue created by recurring events
                            let eventStart = moment(event.start.dateTime);
                            let eventEnd = moment(event.end.dateTime);
                            //console.log("eventName", event.summary)
                            //console.log("eventStartUtc", eventStart.format())
                            //console.log("eventEndUtc", eventEnd.format())
                            //console.log("searched", searched.format())

                            // add here the condition on end time of the meeting
                            if ((searched.isSameOrAfter(eventStart) && searched.isSameOrBefore(eventEnd)) || (searchedEnd.isSameOrAfter(eventStart) && searchedEnd.isSameOrBefore(eventEnd))) {
                                let eventName = event.summary.toLowerCase();
                                //console.log("busy room for eventName", eventName);
                                let location = "non défini";
                                if (typeof event.location != "undefined") {
                                    location = event.location.toLowerCase();
                                }
                                let foundARoom = false;
                                for (let i in meetingsRooms) {
                                    let roomName = meetingsRooms[i].name;
                                    //console.log("Testing the room", roomName);
                                    // si la salle est nommée
                                    if (location.indexOf(roomName) > -1 || eventName.indexOf(roomName) > -1) {
                                        busyRooms.push(meetingsRooms[i].id);
                                        console.log("Room ", roomName, " is busy with the event ", eventName, location);
                                        foundARoom = true;
                                        break;
                                    }
                                }
                                if (foundARoom === false) {
                                    errors.push(eventName + " - " + location);
                                }
                            }
                        }
                    }
                }

                let availableRooms = [];
                for (let i in meetingsRooms) {
                    let room = meetingsRooms[i];
                    let isBusy = false;
                    for (let j in busyRooms) {
                        let busy = busyRooms[j];
                        if (busy === room.id) {
                            isBusy = true;
                        }
                    }
                    if (isBusy === false) {
                        availableRooms.push(room);
                    }
                }
                //console.log("availableRooms", availableRooms);

                let output;
                if (availableRooms.length > 1) {
                    let roomNames = availableRooms.map(function (item) {
                        return `${item.id}.${item.name} (${item.numberOfPersons} p)`;
                    }).join(", ");
                    output = agent.add(`J'ai trouvé plusieurs salles disponibles : ${roomNames}`);
                } else if (availableRooms.length == 1) {
                    output = agent.add(`Il ne reste qu'une seule salle disponible : ${availableRooms[0].name}`);
                } else if (availableRooms.length == 0) {
                    output = agent.add(`Je suis désolé, mais je n'ai pas trouvé de salle disponible...`);
                }

                if (errors.length > 0) {
                    let errorsText = errors.join(', ');
                    agent.add(`J'ai eu un problème avec : ${errorsText}. Il faudrait mieux que vous vérifiez vous même l'agenda ici : https://calendar.google.com/calendar/r`)
                }

                agent.add("Veux tu que je regarde aussi dans l'agenda Square ouvert ?")
                resolve();

                //agent.add(`J'ai trouvé des évènements ${JSON.stringify(response.data)}`);
            });
        });


    }

    function lookupForAMeetingRoomInSquareOuvert(agent) {
        console.log("lookupForAMeetingRoomInSquareOuvert context", agent.context);

        agent.add(`Je regarde ce qui est disponible...`);
        agent.add(`Veux tu que je t'aide à réserver une salle ? Si oui, dis moi quelle salle réserver`);
    }

    function bookARoom(agent) {
        console.log("bookARoom ", agent.parameters);
        console.log("bookARoom context", agent.context);
        agent.add("voici le lien")
    }

    // Run the proper function handler based on the matched Dialogflow intent name
    let intentMap = new Map();
    intentMap.set('Default Welcome Intent', welcome);
    intentMap.set('Default Fallback Intent', fallback);
    intentMap.set('Recherche salle de reunion', lookupForAMeetingRoom);
    intentMap.set('Recherche square ouvert - yes', lookupForAMeetingRoomInSquareOuvert);
    intentMap.set('reservation de salle - yes - yes', bookARoom);
    // intentMap.set('your intent name here', googleAssistantHandler);
    agent.handleRequest(intentMap);
})
;
