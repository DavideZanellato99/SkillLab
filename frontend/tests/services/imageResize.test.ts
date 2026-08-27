import { afterEach, describe, expect, it, vi } from 'vitest'

import { resizeAvatarImage } from '../../src/services/imageResize'

/* Il ridimensionamento è un'ottimizzazione, e quello che conta davvero è che
 * non impedisca mai di caricare un ritratto: quando il browser non sa fare il
 * lavoro, il file esce di qui com'era entrato.
 *
 * jsdom non decodifica immagini e non disegna: `createImageBitmap` e il
 * canvas si sostituiscono, e quello che si verifica è la decisione presa a
 * partire dalle misure, che è tutta la logica che c'è. */

const originale = () => new File(['xxx'], 'ritratto.png', { type: 'image/png' })

/** Un browser che decodifica un'immagine di quelle misure e disegna. */
function browserCheFunziona(width: number, height: number) {
  const drawImage = vi.fn()
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage }),
    toBlob: (cb: (b: Blob | null) => void) => cb(new Blob(['ridotta'], { type: 'image/webp' })),
  }
  vi.spyOn(document, 'createElement').mockReturnValue(canvas as unknown as HTMLElement)
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width, height, close: vi.fn() }))
  return { canvas, drawImage }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('il ritratto ridotto prima di partire', () => {
  it('porta il lato lungo a 512 tenendo le proporzioni', async () => {
    const { canvas } = browserCheFunziona(2000, 1000)

    const file = await resizeAvatarImage(originale())

    expect(canvas.width).toBe(512)
    expect(canvas.height).toBe(256)
    expect(file.type).toBe('image/webp')
    expect(file.name).toBe('ritratto.webp')
  })

  it('misura il lato lungo anche quando è l’altezza', async () => {
    const { canvas } = browserCheFunziona(600, 1200)

    await resizeAvatarImage(originale())

    expect(canvas.height).toBe(512)
    expect(canvas.width).toBe(256)
  })

  /* Ingrandire non aggiunge dettaglio, aggiunge pixel: il file peserebbe di
   * più per vedersi peggio. */
  it('lascia stare un’immagine già piccola', async () => {
    browserCheFunziona(300, 200)
    const file = originale()

    expect(await resizeAvatarImage(file)).toBe(file)
  })

  /* Un'ottimizzazione che impedisce di caricare un'immagine ha fatto più
   * danni di quanti ne eviti. */
  it('torna al file originale quando il browser non sa decodificarlo', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('formato ignoto')))
    const file = originale()

    expect(await resizeAvatarImage(file)).toBe(file)
  })

  it('torna al file originale quando il canvas non produce niente', async () => {
    vi.spyOn(document, 'createElement').mockReturnValue({
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: vi.fn() }),
      toBlob: (cb: (b: Blob | null) => void) => cb(null),
    } as unknown as HTMLElement)
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: 2000, height: 2000, close: vi.fn() }),
    )
    const file = originale()

    expect(await resizeAvatarImage(file)).toBe(file)
  })

  /* Il bitmap tiene memoria finché non lo si chiude, anche a lavoro finito. */
  it('chiude sempre il bitmap che ha aperto', async () => {
    const close = vi.fn()
    vi.spyOn(document, 'createElement').mockReturnValue({
      width: 0,
      height: 0,
      getContext: () => null,
      toBlob: vi.fn(),
    } as unknown as HTMLElement)
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: 2000, height: 2000, close }),
    )

    await resizeAvatarImage(originale())

    expect(close).toHaveBeenCalled()
  })
})
