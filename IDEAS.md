1. Quiero que cambies todos los iconos que has puesto de emojis por iconos de lucide-react para que parezca mas profesional
2. Que al entrar detecte el idioma del navegador y lo ponga en ese y si es otro el default es ingles
3. Quiero añadir dubstep a la lista de generos, pero tambien a lo que recopila el server
4. Quiero que si el usuario no esta logueado, que al pinchar en un evento o dj del mapa, le lleve primero a la pantalla de loguearse, que no lo pueda ver si no esta logueado
5. Cuando abro el perfil de un Dj se reproduce automaticamente su soundcloud si tiene, eso perfecto, el tema es que si abro sus videos/audios/fotos, y reproduzco una suenan a la vez y no, la de soundcloud tendria que parar y viceversa o la que sea, para que no suenen 2 a la vez
6. Que el ranking que ahora es de Djs, no sea solo de Djs ahora se llamara ranking, y lo primero que veras es el de Djs pero podras cambiar para ver el de los eventos/fiestas que se medira por gente que le ha dado a voy a ir, y que todavia no han pasado o estan pasando.
7. Que las fiestas al igual que los Djs que en su panel tienen #2 en Madrid, ranking local tal... Pues que las fiestas el top 5 de gente que le haya dado a voy a ir que no hayan pasado o esten pasando, que aparezca esto tambien, y que en el mapa de alguna manera se note que estan trending. Ademas arriba a la izquierda quiero que aparezcan para hacerles click e ir y que haya una cuenta atras, ordenados de 1 a 5 no por el tiempo que quede.
8. Vamos a completar el perfil de los DJs, quiero que pueda a parte del genero principal que este sera de una lista cerrada como lo es ahora, que pueda añadir hasta 2 subgeneros pudiendo elegir de la lista cerrada o escribiendolo a mano. Tambien que pueda añadir instagram, spotify, tiktok y youtube. Y luego a parte podra rellenar un tipo de información que solo veran los promotores en una nueva vista que añadiremos en el futuro es decir no saldra en el panel: Tendra un calendario de fechas libres, donde podra marcarlas aunque se rellenerá automaticamente con las fechas donde haya sido agregado al line up o haya puesto como voy a ir (en el dia y durante lo que dure el evento), chache orientativo o tarifa negociable, disponibilidad para viajar si/no. Ademas necesito que cambies la estructura de como se ven los perfiles sobretodo al editarlos, porque no me esta cabiendo en la pantalla se sale por arriba y por abajo. 




1. Hay que arreglar una cosa super molesta y es que copio y pego una url de una red social en mi perfil, y cuando cambio de pagina y vuelvo se borra lo que he puesto.
2. En el panel de Dj, el que se abre cuando pinchas en el icono del dj en el mapa, ahora mismo estan destacando mas los subgeneros que el genero principal, haz que el genero principal destaque mas yendo el primero de otro color o como tu veas, no ahi que esta junto al BPM
3. Los iconos de Instagram y youtube no existen en lucide-react asique hay que cambiarlos, puedes buscar una alternativa o necesita que descargue las imagenes?
4. Haz que pueda deshacer el voy a ir
5. Hay que añadir un nuevo tipo de usuario llamado Club / Sala, esto implica que en todos los sitios donde se pueda elegir una sala, saldra un desplegable en que te saldran los clubs que hay registrados pero aun asi podras poner lo que quieras, eso si si pones uno registrado, en el panel al igual que el promotor, te saldra para pinchar el perfil de la sala. Recuerda añadirlo en todos los sitios como editar el perfil, al loguearte por primera vez etc.
6. En la pantalla de admin quiero que junto al mensaje que me mandan, salga que tipo de usuario es
7. En mis chats, que pueda ver un badge tambien con el tipo de usuario que es. y ademas que pueda filtrar los chats por tipo de usuario o evento o grupos
8. EN los grupos privados el creador de grupo, tiene que ser capaz que agregar miembros y expulsarlos en un buscador que le salgan en el desplegable y los seleccione.


-------------
1. Añade una caracteristica comun a todos los usuarios que sera poder hacer un upgrade de su cuenta a PRO, de momento esta caracteristica se mantendra oculta lista para activarla, pero va a servir para limitar todo tipo de acciones
2. Hay que eliminar el pinchar radar en el mapa (modo secret location) al crear un evento verdad? es decir si ya estas pinchando la real, solo deberia desviar si activas secret location, elimina eso.
3. Al editar un club, que te permita al igual que en las fiestas poner la calle y numero exacta, luego al crear una fiesta si pones el club, se rellenara automaticamente la calle y numero
4. Al crear una fiesta, si creo un nuevo escenario no puede ser que me salgan ahi los mismo djs que ya añadi en el main stage, es decir en el desplegable si, pero no ya puesto cuando lo puse en otro escenario. Ademas jugando con eso al principio me salian en el desplegable y ya no se me ha bugueado o algo.
5. En crear fiesta, he borrado el club que habia añadido y se ha quedado puesto el badge de club oficial arreglalo, ademas quiero que se elija si se quiere club o no aunque venga predeterminado, puede ser que sea una fiesta sin club. de hecho una cosa deberia ser nombre de fiesta y otra el club, porque ademas veo que arriba de dice que metas el club sala y abajo nombre de sala eso no puede ser.
---------
1. Haz que el boton de subir fiesta solo salga si eres un club o un promotor, a parte ponlo en el navbar mejor, y los checkboxes para filtrar lo que hay en el mapa, esta guay pero mejora un poco el diseño.
2. Haz que en el panel del evento, salga el club, tal cual sale el promotor, que puedas hacer click y ver el perfil del club, solo tienes que controlar que mientras que este en secret location tiene no tiene que mostrarlo tiene que ser incognita, ademas lo de secret location en el formulario me gustaba que estuviera de color morado ponlo asi.
3. Vale ahora mira en el panel de los clubs, si pinchas en una fiesta/evento, se desplegara a la izquierda el panel con la información del evento, exactamente igual que como ya se hace con los djs y los propios eventos, pudiendo ademas desplegar el chat del evento es decir chat evento <- evento <- club. Ademas en los clubs hay que poner un boton para ver la información del club, sera lo tipico, un video, imagenes, la web ofcial y las redes sociales, bastante de esta información todavia no hemos hecho posible que se introduzca en el perfil asique habria que hacerlo tambien.
4. Cuando un evento esta asociado a un club no saldra representado en el mapa, porque los clubs hacen de agrupador de eventos, por lo tanto igual que pasa cuando hay varios eventos en una misma localizacion sale un +5 o lo que sea en los clubs sera igual segun el numero de eventos que contengan.




1. Si hay una fiesta en secret location, no puede salir en el panel del club en la que es hasta que el usuario no le da a voy a ir y por lo tanto deja de ser secret location
2. Creo que ya te lo dije antes, pero si una fiesta pertenece a un club, el club tiene que hacer de agrupadono tiene que aparecer ese evento en el mapa(siempre que no este en modo secret location, si lo estuviera , si), de lo contrario lo que pasara es que el icono del club pondra +1. Pero repito siempre que el evento no este activamente en modo secret location en ese caso hara como si no tuviera nada que ver con el club.
3. Y cambia que las salas no salgan al principio marcada, quiero que ahora si salgan, que salga todo marcado. eventos, djs y clubs
4. El badge de la carta de presentación que sea del color del tipo de perfil, en vez de que siempre sea amarillo, es decir si es un dj pues naranja, si es un club azul, etc
5. Hay que poner una opción para las imagenes de las galerias de djs o clubes, poder hacerles click y verlas en grande y luego poder ir haciendo click en derecha e izquierda e ir navegando por la galeria haya videos o imagenes, (los audios que habra en el caso de los Djs los saltas)
6. Una configuración adicional, si esta en secret location, y el promotor es la misma cuenta que el club donde esta en realidad ese evento, que salga tambien como incognita.
7. Quita el boton en los perfiles de Descargar para Instagram stories y pon uno para hacerse PRO.




1. Quiero que al pulsar en un elemento en el mapa, me lleve a el como ya hace pero no que me aleje la vista.
2. En el panel del DJ, si tiene una fiesta este en el lineup o simplementa vaya ir, si esta en secret location, el nombre y la localizacion saldran con ?? o lo que sea que indique que es en secreto, pero el orden y las badges que salen a la derecha de en lineup, va ir en curso etc esas mantenlas. (Obviamente cuando deje de estar en secreto para el usuario aparecerá normal)
3. Se puede cambiar el theme del reproductor de soundcloud? es que me sale en blanco, estaria bien uno oscuro o naranja al menos que pegue con lo demas
4. Haz que los usuario Club, tambien puedan subir una cancion que se reproduzca al pulsar en su perfil, y claro si reproduces un video suyo o clickeas en una de sus fiestas(y se reproduce el audio de la fiesta), que se mutee.
5. Al entrar a la web, si ya eres un usuario logueado que tiene una provincia elegida, el mapa te llevará ahi con una vision general de la provincia
6. Añade un boton en el navbar a la derecha de tu usuario que al pulsar te lleva directamente a tu posicion en el mapa, claro este boton solo aparecerá si primero eres un tipo de usuario que puede tener un icono en el mapa, es decir un dj o un club, y segundo si lo tienes configurado.
7. añade en Ranking, una seccion para clubs trending, estos estarán ordenados, de la siguiente manera: se cogerán todos los eventos/fiestas que se hacen en el futuro o estan pasando ahora en ese club, suma todos sus voy a ir, y ese es el ranking de mayor a menor obviamente.


1. Dame RaveMap.jsx completo
2. Hay un error al pulsar en el badge de club en el panel de un evento, es decir si yo pulso en el club en el mapa me muestra su informacion correctamente, pero si pulso en el badge, me lleva hacia el evento y el nombre y tal esta bien pero hay datos que no por ejemplo me he dado cuenta el genero esta mal, no muestra subegenros si los tiene el bpm etc
3. En todos los paneles sea el tipo de usuario que sea, quiero que si pulso en la imagen o el nombre, me abra su perfil
4. El reproductor de soundcloud mola mucho, el problema es que tambien se invierten los colores de la imagen, entonces haz una cosa, o por el reproductor en un formato en el que no se vea la imagen y entonces manten los estilos o vuelve a poner los estilos normales.

----------------t----------t---------t-------------------------
1. Quiero que elimines el tema de que salgan lineas en el mapa desde el dj hacia los eventos a los que va.
2. Quiero que en el ranking en clubs trending, solo ponga clubs, y añadas una pestaña mas que es Promotores (la tercera por mantener un orden), y el criterio sera el mismo q en los clubes, se sumaran los voy a ir de las fiestas asociadas q tenga el promotor
3. Que en los eventos, cuando le das ver quien le ha dado a voy a ir o busco rave squad, que envez de salir en el propio panel, salga en un modal en el centro de la pantalla con los usuarios.
4. Quiero que en panel de admin me ponga una casilla, que si esta marcada, automaticamente todos los perfiles se aceptan, de lo contrario, al entrar un usuario nuevo, si elige raver nada, pero sino, elija dj, promotor o club, se le indicara que debe ser verificado y se le dara la oportunidad de mandar un mensaje junto con la peticion, y mientras se aprueba o no permaencerán como ravers normales y en notificaciones les saldra que su solicitud esta en proceso de revision y luego cuando se acepte o se rechace. Obvio tambien hay que hacer que estas peticiones lleguen al panel de admin, y ahi se podran aceptar entonces el perfil cambiara a eso o rechazar y simplemente seguiran siendo ravers normales. Y ademas quiero que el input para cambiar de rol en editar perfil, solo les salga a las cuentas Raver, por lo tanto actualiza el mensaje ese del principio de que luego podran cambiar de rol porque no es asi si no eres raver.
...............................
...............................
1. En el panel de los clubs y las promotoras, donde pone proximas fiestas, en esas cards que salga tambien la provincia, (de hecho creo que ya salen, tal vez el problema es que no lo veo porque esa fiesta en concreto la ha creado un club y entonces deberia heredar esa provinca del club, revisalo, tal vez ya esta bien y son datos antiguos lo que veo)
2. Entre DJs quiero que cuando pulsas en el perfil de otro DJ al lado de añadir amigo, salga algo asi como pedir colaboracion, lo que pasara sera similar a cuando aplicas o te llega una oferta en colaboraciones, es decir en la pestaña colaboraciones en chats, empezaran un chat con esa persona y funciona exactamente igual, no peudes escribirle mas mensajes hasta que te conteste
3. Caundo pincho en un evento en el panel de un DJ, y ese evento lo tiene un club, no quiero solo que te lleve a donde esta el club y te sale el evento, quiero que salga [evento] <- [club] no solo [evento]
4. Cuando selecciono el pin de un DJ en el mapa, que no cambie su color a amarillo, que mantenga el que tenga en este caso naranja, igual que pasa ya con los eventos clubes y promotores
5. Que en subir una fiesta, añadir que solo se pueda ir por invitación, esto significa que desaparecerán los botones de voy a ir y busco rave squad de ese evento y habra otro como de pedir permiso o algo asi, una vez sea aceptado, automaticamente, se le habilitaran los botones de voy a ir y busco rave squad y el de voy a ir estará ya marcado, aunque luego la persona lo desmarque ya da igual porque ya esta aceptado. Es decir ademas me gustaria indicar claramente que aunque es opcional una buena combinacion es marcar secret location y por invitacion porque eso hara que hasta que no sean aceptados no se les revelará el sitio. Ademas si lo marcas que es por invitación te tiene que dejar añadir usuarios sean del tipo que sea incluso ravers, y añadirlos para mandarles invitacion automaticamente.
Las invitaciones, determina tu donde es mas profesional e intuitivo que te lleguen, tienes que poder rechazar y aceptar.
6. Tambien quiero para los clubes y promotoras, que puedan abrir en debajo de editar perfil modal para gestionar sus fiestas/eventos, donde podran cambiar detalles(que se puedan cambiar, recuerda las restricciones a la hora de crearlos segun el rol), y si por ejemplo marcaron por invitación que puedan ver una lista de los asistentes es decir los que invitaron + la gente que ha pedido ir y esta pendiente o han sido aceptados y que puedas añadir nuevos, mandandole automaticamente invitacion.
---------
1. Al final solo he aplicado lo de admin, y los estilos de ravemap, la otra optimizacion no
2. Hay un problema a arreglar y es que abri un evento, comento en su chat, y luego abro el chat en mi icono de chat y como que esta ahi pero desaparece, no puede desaparecer si estoy en esa conversacion
3. Estoy intentando crear una fiesta con un club, y me obliga a poner un promotor eso no, cuando es obligatorio es cuando tu mismo eres el promotor y te agrega ati mismo y no t epuedes quitar
4. Quiero que si la fiesta es por invitacion, y todavia no estas aceptado, el boton de comprar entradas tiene que estar bloqueado.
...............................4lvbp;RJNna1.A?a
1. El grafico en la pantalla de Admin, de eventos por dia, me da la sensacion de que no funciona muy bien, porque me esta poniendo como un patron raro en vez de darme informacion real por dia, ademas se sale de la pantalla ala derecha mucho, ya ademas quiero que muestre siempre toda este mes, pudiendo navegar hacia delante y detras
2. Quiero mejorar el rendimiento del mapa, me pasa que a medida de crecen los eventos en el mapa empieza a verse resentido el rendimiento.
llllllllllllllllllllllllllllllllllllllllllllllll
1. Cuanto alguien haya enviado un permiso para ir a tu fiesta, quiero que tambien te salga en las notificaciones, pudiendo ahi tambien aceptarla o rechazarla
2. Cuando tengo abierto un evento de un club, me he dado cuenta que si tengo a la vez puesta la cancion del club y pongo la del evento, suenan a la vez, eso no puede ser
3. En la notificacion que te sale cuando te han aceptado, que al hacer click te lleve a la fiesta/evento, recuerda si esta dentro de un club tiene que hacerte [evento] <- [club]
4. haz que el boton del chat este en el centro abajo en vez de abajo derecha, y entonces el panel que se abra con sentido 
5. He hecho click en una notificacion de una invitacion auna fiesta y me ha dado este error, tal vez porqeu ya no exista, esto hay que tenerlo en cuenta si no existe que desaparezcan Uncaught Error: Invalid LatLng object: (undefined, undefined) he above error occurred in the <RaveMap> component: at RaveMap (
llllllllllllllllllllllllllllllllllllllllllllllllll
...............................
1. Quiero que una vez que se abra ese chat de colaboraciones al aplicar o recibir una una oferta, que no se pueda escribir ningun mensaje mas del emisor, hasta que no sea respondido, luego ya si.
2. Quiero que de los DJs, todas su fechas salgan como libres, a no se que esten ocupadas, y que en vez de manualmente poner libre, que manualmente pongas ocupado, Ademas quiero que mejores el calendario para que pueda ser hasta 6 meses en el futuro que s epueda navegar por meses
3. Quiero que en el panel de administrador, tenga una grafica para ver cuantos eventos hay por dia, y que diferencie entre eventos sacados por el servidor de internet y eventos creados por usuarios. Ademas otra grafica para ver numero de usuarios a lo largo del tiempo, diferenciando por los tipos. Y quiero ver que usuarios son PRO tambien.
4. He borrado un usuario de la tabla profiles, he cerrado sesion, y al iniciar sesion, fingiendo que me registraba, me ha dado este error NavBar.jsx:38 Uncaught ReferenceError: Cannot access 'isAdmin' before initialization
    at Navbar (NavBar.jsx:38:88)
    at renderWithHooks (react-dom_client.js?v=ef91fa41:11596:26)
    at updateFunctionComponent (react-dom_client.js?v=ef91fa41:14630:28)
    at beginWork (react-dom_client.js?v=ef91fa41:15972:22)
    at HTMLUnknownElement.callCallback2 (react-dom_client.js?v=ef91fa41:3680:22)
    at Object.invokeGuardedCallbackDev (react-dom_client.js?v=ef91fa41:3705:24)
    at invokeGuardedCallback (react-dom_client.js?v=ef91fa41:3739:39)
    at beginWork$1 (react-dom_client.js?v=ef91fa41:19818:15)
    at performUnitOfWork (react-dom_client.js?v=ef91fa41:19251:20)
    at workLoopSync (react-dom_client.js?v=ef91fa41:19190:13)
(anonymous) @ NavBar.jsx:38
renderWithHooks @ react-dom_client.js?v=ef91fa41:11596
updateFunctionComponent @ react-dom_client.js?v=ef91fa41:14630
beginWork @ react-dom_client.js?v=ef91fa41:15972
callCallback2 @ react-dom_client.js?v=ef91fa41:3680
invokeGuardedCallbackDev @ react-dom_client.js?v=ef91fa41:3705
invokeGuardedCallback @ react-dom_client.js?v=ef91fa41:3739
beginWork$1 @ react-dom_client.js?v=ef91fa41:19818
performUnitOfWork @ react-dom_client.js?v=ef91fa41:19251
workLoopSync @ react-dom_client.js?v=ef91fa41:19190
renderRootSync @ react-dom_client.js?v=ef91fa41:19169
performSyncWorkOnRoot @ react-dom_client.js?v=ef91fa41:18927
flushSyncCallbacks @ react-dom_client.js?v=ef91fa41:9166
(anonymous) @ react-dom_client.js?v=ef91fa41:18677
OnboardingModal.jsx:55 Warning: React has detected a change in the order of Hooks called by OnboardingModal. This will lead to bugs and errors if not fixed. For more information, read the Rules of Hooks: https://reactjs.org/link/rules-of-hooks

   Previous render            Next render
   ------------------------------------------------------
1. useCallback                useCallback
2. useCallback                useCallback
3. useSyncExternalStore       useSyncExternalStore
4. useDebugValue              useDebugValue
5. useState                   useState
6. useState                   useState
7. useState                   useState
8. undefined                  useEffect
   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

    at OnboardingModal (http://localhost:5173/src/components/OnboardingModal/OnboardingModal.jsx?t=1793043081998:48:82)
    at main
    at App (http://localhost:5173/src/App.jsx?t=1793043216650:39:235)
printWarning @ react-dom_client.js?v=ef91fa41:521
error @ react-dom_client.js?v=ef91fa41:505
warnOnHookMismatchInDev @ react-dom_client.js?v=ef91fa41:11543
updateHookTypesDev @ react-dom_client.js?v=ef91fa41:11513
useEffect @ react-dom_client.js?v=ef91fa41:12750
useEffect @ chunk-DRWLMN53.js?v=ef91fa41:1078
(anonymous) @ OnboardingModal.jsx:55
renderWithHooks @ react-dom_client.js?v=ef91fa41:11596
updateFunctionComponent @ react-dom_client.js?v=ef91fa41:14630
beginWork @ react-dom_client.js?v=ef91fa41:15972
beginWork$1 @ react-dom_client.js?v=ef91fa41:19806
performUnitOfWork @ react-dom_client.js?v=ef91fa41:19251
workLoopSync @ react-dom_client.js?v=ef91fa41:19190
renderRootSync @ react-dom_client.js?v=ef91fa41:19169
performSyncWorkOnRoot @ react-dom_client.js?v=ef91fa41:18927
flushSyncCallbacks @ react-dom_client.js?v=ef91fa41:9166
(anonymous) @ react-dom_client.js?v=ef91fa41:18677
react-dom_client.js?v=ef91fa41:11726 Uncaught Error: Rendered more hooks than during the previous render.
    at updateWorkInProgressHook (react-dom_client.js?v=ef91fa41:11726:21)
    at updateEffectImpl (react-dom_client.js?v=ef91fa41:12122:22)
    at updateEffect (react-dom_client.js?v=ef91fa41:12147:18)
    at Object.useEffect (react-dom_client.js?v=ef91fa41:12751:22)
    at useEffect (chunk-DRWLMN53.js?v=ef91fa41:1078:29)
    at OnboardingModal (OnboardingModal.jsx:55:3)
    at renderWithHooks (react-dom_client.js?v=ef91fa41:11596:26)
    at updateFunctionComponent (react-dom_client.js?v=ef91fa41:14630:28)
    at beginWork (react-dom_client.js?v=ef91fa41:15972:22)
    at HTMLUnknownElement.callCallback2 (react-dom_client.js?v=ef91fa41:3680:22)
updateWorkInProgressHook @ react-dom_client.js?v=ef91fa41:11726
updateEffectImpl @ react-dom_client.js?v=ef91fa41:12122
updateEffect @ react-dom_client.js?v=ef91fa41:12147
useEffect @ react-dom_client.js?v=ef91fa41:12751
useEffect @ chunk-DRWLMN53.js?v=ef91fa41:1078
(anonymous) @ OnboardingModal.jsx:55
renderWithHooks @ react-dom_client.js?v=ef91fa41:11596
updateFunctionComponent @ react-dom_client.js?v=ef91fa41:14630
beginWork @ react-dom_client.js?v=ef91fa41:15972
callCallback2 @ react-dom_client.js?v=ef91fa41:3680
invokeGuardedCallbackDev @ react-dom_client.js?v=ef91fa41:3705
invokeGuardedCallback @ react-dom_client.js?v=ef91fa41:3739
beginWork$1 @ react-dom_client.js?v=ef91fa41:19818
performUnitOfWork @ react-dom_client.js?v=ef91fa41:19251
workLoopSync @ react-dom_client.js?v=ef91fa41:19190
renderRootSync @ react-dom_client.js?v=ef91fa41:19169
performSyncWorkOnRoot @ react-dom_client.js?v=ef91fa41:18927
flushSyncCallbacks @ react-dom_client.js?v=ef91fa41:9166
(anonymous) @ react-dom_client.js?v=ef91fa41:18677
NavBar.jsx:38 Uncaught ReferenceError: Cannot access 'isAdmin' before initialization
    at Navbar (NavBar.jsx:38:88)
    at renderWithHooks (react-dom_client.js?v=ef91fa41:11596:26)
    at updateFunctionComponent (react-dom_client.js?v=ef91fa41:14630:28)
    at beginWork (react-dom_client.js?v=ef91fa41:15972:22)
    at HTMLUnknownElement.callCallback2 (react-dom_client.js?v=ef91fa41:3680:22)
    at Object.invokeGuardedCallbackDev (react-dom_client.js?v=ef91fa41:3705:24)
    at invokeGuardedCallback (react-dom_client.js?v=ef91fa41:3739:39)
    at beginWork$1 (react-dom_client.js?v=ef91fa41:19818:15)
    at performUnitOfWork (react-dom_client.js?v=ef91fa41:19251:20)
    at workLoopSync (react-dom_client.js?v=ef91fa41:19190:13)
(anonymous) @ NavBar.jsx:38
renderWithHooks @ react-dom_client.js?v=ef91fa41:11596
updateFunctionComponent @ react-dom_client.js?v=ef91fa41:14630
beginWork @ react-dom_client.js?v=ef91fa41:15972
callCallback2 @ react-dom_client.js?v=ef91fa41:3680
invokeGuardedCallbackDev @ react-dom_client.js?v=ef91fa41:3705
invokeGuardedCallback @ react-dom_client.js?v=ef91fa41:3739
beginWork$1 @ react-dom_client.js?v=ef91fa41:19818
performUnitOfWork @ react-dom_client.js?v=ef91fa41:19251
workLoopSync @ react-dom_client.js?v=ef91fa41:19190
renderRootSync @ react-dom_client.js?v=ef91fa41:19169
recoverFromConcurrentError @ react-dom_client.js?v=ef91fa41:18786
performSyncWorkOnRoot @ react-dom_client.js?v=ef91fa41:18932
flushSyncCallbacks @ react-dom_client.js?v=ef91fa41:9166
(anonymous) @ react-dom_client.js?v=ef91fa41:18677
react-dom_client.js?v=ef91fa41:11726 Uncaught Error: Rendered more hooks than during the previous render.
    at updateWorkInProgressHook (react-dom_client.js?v=ef91fa41:11726:21)
    at updateEffectImpl (react-dom_client.js?v=ef91fa41:12122:22)
    at updateEffect (react-dom_client.js?v=ef91fa41:12147:18)
    at Object.useEffect (react-dom_client.js?v=ef91fa41:12751:22)
    at useEffect (chunk-DRWLMN53.js?v=ef91fa41:1078:29)
    at OnboardingModal (OnboardingModal.jsx:55:3)
    at renderWithHooks (react-dom_client.js?v=ef91fa41:11596:26)
    at updateFunctionComponent (react-dom_client.js?v=ef91fa41:14630:28)
    at beginWork (react-dom_client.js?v=ef91fa41:15972:22)
    at HTMLUnknownElement.callCallback2 (react-dom_client.js?v=ef91fa41:3680:22)
updateWorkInProgressHook @ react-dom_client.js?v=ef91fa41:11726
updateEffectImpl @ react-dom_client.js?v=ef91fa41:12122
updateEffect @ react-dom_client.js?v=ef91fa41:12147
useEffect @ react-dom_client.js?v=ef91fa41:12751
useEffect @ chunk-DRWLMN53.js?v=ef91fa41:1078
(anonymous) @ OnboardingModal.jsx:55
renderWithHooks @ react-dom_client.js?v=ef91fa41:11596
updateFunctionComponent @ react-dom_client.js?v=ef91fa41:14630
beginWork @ react-dom_client.js?v=ef91fa41:15972
callCallback2 @ react-dom_client.js?v=ef91fa41:3680
invokeGuardedCallbackDev @ react-dom_client.js?v=ef91fa41:3705
invokeGuardedCallback @ react-dom_client.js?v=ef91fa41:3739
beginWork$1 @ react-dom_client.js?v=ef91fa41:19818
performUnitOfWork @ react-dom_client.js?v=ef91fa41:19251
workLoopSync @ react-dom_client.js?v=ef91fa41:19190
renderRootSync @ react-dom_client.js?v=ef91fa41:19169
recoverFromConcurrentError @ react-dom_client.js?v=ef91fa41:18786
performSyncWorkOnRoot @ react-dom_client.js?v=ef91fa41:18932
flushSyncCallbacks @ react-dom_client.js?v=ef91fa41:9166
(anonymous) @ react-dom_client.js?v=ef91fa41:18677
react-dom_client.js?v=ef91fa41:14080 The above error occurred in the <Navbar> component:

    at Navbar (http://localhost:5173/src/components/NavBar/NavBar.jsx?t=1793042629400:20:26)
    at main
    at App (http://localhost:5173/src/App.jsx?t=1793043216650:39:235)

Consider adding an error boundary to your tree to customize error handling behavior.
Visit https://reactjs.org/link/error-boundaries to learn more about error boundaries.
logCapturedError @ react-dom_client.js?v=ef91fa41:14080
update.callback @ react-dom_client.js?v=ef91fa41:14100
callCallback @ react-dom_client.js?v=ef91fa41:11296
commitUpdateQueue @ react-dom_client.js?v=ef91fa41:11313
commitLayoutEffectOnFiber @ react-dom_client.js?v=ef91fa41:17141
commitLayoutMountEffects_complete @ react-dom_client.js?v=ef91fa41:18030
commitLayoutEffects_begin @ react-dom_client.js?v=ef91fa41:18019
commitLayoutEffects @ react-dom_client.js?v=ef91fa41:17970
commitRootImpl @ react-dom_client.js?v=ef91fa41:19406
commitRoot @ react-dom_client.js?v=ef91fa41:19330
performSyncWorkOnRoot @ react-dom_client.js?v=ef91fa41:18948
flushSyncCallbacks @ react-dom_client.js?v=ef91fa41:9166
(anonymous) @ react-dom_client.js?v=ef91fa41:18677
react-dom_client.js?v=ef91fa41:14080 The above error occurred in the <OnboardingModal> component:

    at OnboardingModal (http://localhost:5173/src/components/OnboardingModal/OnboardingModal.jsx?t=1793043081998:48:82)
    at main
    at App (http://localhost:5173/src/App.jsx?t=1793043216650:39:235)

Consider adding an error boundary to your tree to customize error handling behavior.
Visit https://reactjs.org/link/error-boundaries to learn more about error boundaries.
logCapturedError @ react-dom_client.js?v=ef91fa41:14080
update.callback @ react-dom_client.js?v=ef91fa41:14100
callCallback @ react-dom_client.js?v=ef91fa41:11296
commitUpdateQueue @ react-dom_client.js?v=ef91fa41:11313
commitLayoutEffectOnFiber @ react-dom_client.js?v=ef91fa41:17141
commitLayoutMountEffects_complete @ react-dom_client.js?v=ef91fa41:18030
commitLayoutEffects_begin @ react-dom_client.js?v=ef91fa41:18019
commitLayoutEffects @ react-dom_client.js?v=ef91fa41:17970
commitRootImpl @ react-dom_client.js?v=ef91fa41:19406
commitRoot @ react-dom_client.js?v=ef91fa41:19330
performSyncWorkOnRoot @ react-dom_client.js?v=ef91fa41:18948
flushSyncCallbacks @ react-dom_client.js?v=ef91fa41:9166
(anonymous) @ react-dom_client.js?v=ef91fa41:18677
react-dom_client.js?v=ef91fa41:9176 Uncaught ReferenceError: Cannot access 'isAdmin' before initialization
    at Navbar (NavBar.jsx:38:88)
--------------- ---------- -
1. Que pueda dejar marcado el aceptar automaticamente en el panel de admin e irme, porque ahora lo marco, actualizo y se descarmarca
2. Quiero que si esta marcado el aceptar automaticamente, no les salga el textarea ni un aviso de que se les tendra que aceptar ni notificaciones ni nada de eso
3. Quiero que la priemra vez que te registres te salga una notificacion recordandote que puedes modificar tu perfil y que si eres dj promotor o club, puedes elegir un lugar en el mapa para salir, y que si clickas te lleva a tu perfil para editarlo
4. Quiero que quites el dato BPM de los clubes y promotores
5. Quiero que el holo passport card, lo mejores añadiendo los datos publicos de los tipos de usuario, segun el tipo
6. Vamos a crear un nuevo panel que sera el panel de colaboraciones, podran acceder DJs, Promotores y Salas/Clubes, pero veran y podrán hacer cosas diferentes en el. 
- Los clubes y promotoras, podran crear ofertas, estas contendrán titulo, imagen opcional, dirigido a (DJs, clubes o promotoras)(checkboxes), y descripción. Ademas podran gestionarlas, como darlas por finalizada, ver quienes han aplicado.
- Ademas, los 3 tipos de usuarios al entrar veran una las ofertas activas (las que puedan ver porque esten dirigidas a su tipo), y podran aplicar a ellas pudiendo poner un mensaje.
- Dentro de la gestion de las ofertas (los clubes y promotoras) podran editarla, ver quienes han aplicado a ella, o a quien se la han mandado, es decir quien de alguna manera estan viculados a ellas pudiendo ver su perfil haciendo click.
- En el momento que un club o promotora manda la oferta a alguno de los 3 tipos de usuarios o un Dj aplica a alguna, siempre que se inicia esta relacion hay que poner un mensaje adjunto por lo tanto esto tiene sentido y es necesario porque al hacer eso por lo que te digo a continuacion:
- En el chat que ya esta implementado, hay que meter una nueva seccion llamada colaboraciones, en ellas en el momento en el que se inicia una relacion de este tipo con ese primer mensaje, ya aparece en un chat privado con el emisor de la oferta y quien la recibe o viceversa. Sin la necesidad de tener que ser amigos(de hecho funciona a parte, es posible que tu ya tengas un chat con esa entidad y no deben juntarse ni nada)
- Ademas un club o promotor, a parte de ofertas activas, puede ver un listado de DJs, clubs y promotores en esa pantalla y darle a un boton para que eligiendo una de sus ofertas activas se la pueda mandar junto con el mensaje personalizado.
----------------------------------------------------
1. Me ha pasado que he clcikado en un promotor en el mapa, se me ha abierto su panel, y luego he clickado en un dj o club, y en vez de sustituirse el panel se me ha abierto a la izquierda, eso no, tiene que sustituirse
2. en los perfiles de dj todo el tema de ver info para promotes y clubs que siga saliendo mejor en morado, que lo has cambiado a rojo y no
3. Tanto en los clubs como en promotores, tienes que hacer que salga en el panel principal en vez de en el secundario, la web y las redes sociales. 
--------------------------------------------------------------------------------
1. Un pequeño detalle, cuando desbloqueo un secret location, en el caso de que este en un club, ahora lo que hace es que la camara me lleva a el y me muestra la fiesta/evento, esto esta bien pero estaria mejor que en vez de aparecer solo el panel del fiesta/evento, mejor aparezca el panel del club con el fiesta/evento seleccionado y el panel del fiesta/evento visible entonces.
2. Otro arreglo he observado que si buscas rave squad se desmarca el Voy a ir, y no, son independientes tu puedes querer ir y buscar rave squad
3. Quiero que cuando marque un evento como voy a ir no se ponga en verde el marco del icono en el mapa, es decir quiero deshacer ese cambio
4. Quiero que puedas hacer click en 1 "X van a ir" y en "x buscan grupo" y puedas ver el listado de usuarios que le han dado, ahi aparecera cualquier tipo de usuario, la idea es que los ravers normales tambien puedan encontrar a otros.
5. Quiero que en el panel de ¿Cual es tu rol en la escena?, al club / sala le pongas su color azul y no verde. Y para todos los sitios donde este promotor hay que cambiarlo a otro color, porque el morado ya se usa por los secret location, pero que no sea verde.
6. Haz que los promtores, 1. puedan añadirse tambien en el mapa, osea que puedan elegir ubicacion en mapa, por lo tanto tambien puedan configurar lo de audio principal al abrir tu pin en el mapa y multimedia como los clubs con videos y fotos. Ademas tambien tiene lo de pagina web oficial.
 ----

5. Vamos a crear un nuevo panel que sera el panel de colaboraciones, podran acceder DJs, Promotores y Salas/Clubes, pero veran y podrán hacer cosas diferentes en el. 
- Los clubes y promotoras, podran crear ofertas, estas contendrán titulo, imagen opcional, dirigido a (DJs, clubes o promotoras)(checkboxes), y descripción. Ademas podran gestionarlas, como darlas por finalizada, ver quienes han aplicado.
- Ademas, los 3 tipos de usuarios al entrar veran una las ofertas activas (las que puedan ver porque esten dirigidas a su tipo), y podran aplicar a ellas pudiendo poner un mensaje.
- Dentro de la gestion de las ofertas (los clubes y promotoras) podran editarla, ver quienes han aplicado a ella, o a quien se la han mandado, es decir quien de alguna manera estan viculados a ellas pudiendo ver su perfil haciendo click.
- En el momento que un club o promotora manda la oferta a alguno de los 3 tipos de usuarios o un Dj aplica a alguna, siempre que se inicia esta relacion hay que poner un mensaje adjunto por lo tanto esto tiene sentido y es necesario porque al hacer eso por lo que te digo a continuacion:
- En el chat que ya esta implementado, hay que meter una nueva seccion llamada colaboraciones, en ellas en el momento en el que se inicia una relacion de este tipo con ese primer mensaje, ya aparece en un chat privado con el emisor de la oferta y quien la recibe o viceversa. Sin la necesidad de tener que ser amigos(de hecho funciona a parte, es posible que tu ya tengas un chat con esa entidad y no deben juntarse ni nada)
- Ademas un club o promotor, a parte de ofertas activas, puede ver un listado de DJs, clubs y promotores en esa pantalla y darle a un boton para que eligiendo una de sus ofertas activas se la pueda mandar junto con el mensaje personalizado.
----------------------------------------------------------------------------------------

2. Quiero que quites lo de descargar para instagram stories y pongas en su lugar un boton que abra lo de upgradear la cuenta a PRO. Ademas quiero que en la version gratis el limite para cualquier cuenta sea audios limitados a 4min y 5 audios como maximo (canciones) y 5 fotos. y videos ya sea video del club o sesiones de djs, a 0, no se puede subir si no eres PRO




1. Quiero añadir una regla a la base de datos para que cualquier cosa que no este en uso en algun registro, se borre automaticamente del storage.
2. El badge del usuario de que tipo de usuario es tambien tiene que estar en las peticiones de amistad
3. Quiero que al pinchar en un DJ en el mapa, salga una linea a todos los eventos donde este en el lineup
4. Quiero que donde pone eso de info para promotores y tal, que aclare que es para promotores y clubs
5. Quiero que los clubs tambien tengan su icono en el mapa, como el de los eventos cuadrado pero de otro color, y por lo tanto al pincharle aparecera tambien un panel con su información
6. Ahora mismo en el mapa hay un selector para ver todo, solo eventos o solo djs / producers. vale quiero que esto cambie ademas que ahora esta en fila y lo quiero en columna, lo que quiero es que se puedan seleccionar por checkboxes estando eventos y djs marcados por defecto al entrar en la web, y clubs que hay que añadirlo desmarcado.


2. Vamos a hacer que en DJ / PRODUCER VERFICADO, simplemente salga DJ / PRODUCER, y que si en la base de datos efectivamente estan verificados, entonces si aparecera lo de verificado, ademas si lo estan, en sus iconos en todas partes tanto en chat como en el panel como en el mapa arriba a la derecha del icono aparecerá un icono de verificado. Ademas en la ventana de admin, añade que pueda buscar un usuario y darle el verificado. Y para los eventos tambien, añade la posibilidad de que haya eventos verificados. Y tambien promotores verificados. 


5. Que solo puedas crear fiestas, ademas si eres promotor.

7. Crear panel de promotor (DESARROLLAR idea)
------------

1. Hay que pensar bien el tema de que salgan los eventos en los que participara el DJ en su panel
2. Hay que pensar que poner en los iconos de los eventos

1. En cualquier sitio que este perfil de un DJ o raver, al hacer click tengo que poder ver su perfil solo que si es DJ 




1. Me gusta eso de que si eres pro en el mapa se ponga como ese doble circulo, pero que siga manteniendo el naranja, no dorado, y en el nombre no me gusta ese degradado, que el fondo sea negro como antes, y cuando hago click que las letras sigan siendo blancas. Ademas cuando le pincho y se abre el panel, que salga algun badge distintivo de PRO, las letras de mostrar mas que sean en naranja. Y ademas he detectado un bug, cuando abro el chat de un evento desde el panel, es como que se rompe un poco la estructura y se esconde por ejemplo la X de cerrar y tal. 
2. No acabo de entender porque hay un evento en el mapa, que tiene en su pin PRO y los bordes como dobles y tal, Eso no hay que hacerlo para nada tiene que estar como antes.
3. En las notificaciones, me han mandado una y se corta el abdge de Raver, arreglalo