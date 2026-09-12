/* Quanto è alta una riga del corpo di una tabella.
 *
 * Le righe di una stessa tabella non erano tutte alte uguali: una persona
 * con l'email sotto il nome era più alta di una senza, una riga con la
 * targhetta del ruolo più di una senza, e sfogliando le pagine la tabella
 * cambiava altezza e con lei tutto quello che stava sotto. L'altezza è della
 * tabella e ogni riga la prende: quella con meno dentro resta alta quanto le
 * altre, con il contenuto centrato.
 *
 * Intestazione e fascia in fondo non c'entrano: hanno la loro misura e non
 * cambiano con il contenuto. Nemmeno la riga che si apre sotto un'altra
 * (vedi `detail` su `Tr`): è un pannello, non una riga dell'elenco.
 *
 * Il numero viene dalle celle: imbottitura di un rem sopra e sotto più due
 * righe del testo delle celle, che è a 0,85 rem con l'interlinea del corpo a
 * 1,6, cioè circa 44 pixel. Due righe perché il testo può andare a capo una
 * volta (vedi `Td`), oppure perché sotto il nome c'è una seconda riga più
 * piccola: l'email, la categoria, il documento, il motivo della sospensione.
 * Il nome di una persona, di un avatar, di una simulazione o di una
 * organizzazione sta su una riga sola, è corto per natura e la seconda riga
 * la spende quello che gli sta sotto; quello che avrebbe bisogno di una
 * terza riga si mette accanto, come l'organizzazione accanto all'email nelle
 * assegnazioni dei percorsi.
 *
 * È una misura sola per tutte le tabelle, e non una per contenuto: c'erano
 * tre misure nominate, e una dopo l'altra le tabelle sono finite tutte nella
 * più bassa, perché una riga più alta serviva sempre a un a capo che non
 * arrivava mai. Sta in un file suo perché la leggono in due, la tabella e
 * lo scheletro che ne disegna la forma mentre le righe arrivano. */
export const ROW_HEIGHT = '80px'
