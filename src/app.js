const app        = require('express')()
const bodyParser = require('body-parser').json()
const port       = 3000

const axios     = require('axios').default
const { JSDOM } = require('jsdom')

const readability = require('readability')

app.get('/', (req, res) => res.send('Hello World!'))
app.post('/', bodyParser, (req, res) => {
  const url = req.body.url

  if (url === undefined || url === '') {
    return res
      .status(400)
      .send({
        'error': 'Send JSON, like so: {"url": "https://url/to/whatever"}'
      })
      .end
  }

  console.log('Fetching ' + url + '...')

  axios
    .get(url)
    .then((response) => {
      const dom = new JSDOM(response.data)

      const parsed = new readability(dom.window.document, {}).parse()

      console.log('Fetched and parsed ' + url + ' successfully')

      return res
        .status(200)
        .send({
          url: url,
          content: parsed.content
        })
        .end()

    })
    .catch((error) => {
      return res
        .status(500)
        .send({
          error: 'Some weird error fetching the content',
          details: error
        })
    })
})

app.listen(port, () => console.log(`Readability.js server listening on port ${port}!`))
