function loadScript(url) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.onload = resolve
    script.onerror = reject
    script.async = true
    script.src = url
    document.head.appendChild(script)
  })
}

function equalByKeys(objA, objB, ...keys) {
  for (const key of keys) {
    if (objA[key] !== objB[key])
      return false
  }
  return true
}

const { createContext } = ReactBroadcast

const { Provider: GoogleApiProvider, Consumer: GoogleApiConsumer } = createContext(null);
GoogleApiProvider.displayName = 'GoogleApiProvider'
GoogleApiConsumer.displayName = 'GoogleApiConsumer'

class GoogleAPI extends React.Component {
  static propTypes = {
    clientId: PropTypes.string.isRequired,
    apiKey: PropTypes.string.isRequired,
    discoveryDocs: PropTypes.arrayOf(PropTypes.string).isRequired,
    scopes: PropTypes.arrayOf(PropTypes.string).isRequired
  }

  authorize = () => {
    if (this.auth) {
      this.auth.signIn()
    }
  }

  signout = () => {
    if (this.auth) {
      this.auth.signOut()
    }
  }

  state = {
    signedIn: false,
    client: null,
    loading: true,
    error: null,
    authorize: this.authorize,
    signout: this.signout
  }

  componentDidMount() {
    this.setupApi()
  }

  async setupApi() {
    try {
      if (typeof window.gapi === 'undefined') {
        await loadScript('https://apis.google.com/js/api.js')
      }
      if (!gapi.client) {
        await new Promise((resolve, reject) => gapi.load('client:auth2', {
          callback: resolve,
          onerror: reject
        }));
      }
      await gapi.client.init({
        apiKey: this.props.apiKey,
        clientId: this.props.clientId,
        discoveryDocs: this.props.discoveryDocs,
        scope: this.props.scopes.join(',')
      })
      this.auth = gapi.auth2.getAuthInstance()
      this.setState({
        client: gapi.client,
        loading: false,
        signedIn: this.auth.isSignedIn.get()
      })
      // Listen for sign-in state changes.
      this.auth.isSignedIn.listen(signedIn => this.setState({ signedIn }));
    } catch (error) {
      this.setState({
        loading: false,
        error
      })
    }
  }

  render() {
    return (
      <GoogleApiProvider value={this.state}>
        {this.props.children(this.state)}
      </GoogleApiProvider>
    );
  }

}

class GSheetData extends React.Component {
  static propTypes = {
    id: PropTypes.string.isRequired,
    range: PropTypes.string.isRequired,
    api: PropTypes.object.isRequired
  }

  state = {
    error: null,
    data: null,
    loading: false
  }

  componentDidMount() {
    this.fetch()
  }

  componentDidUpdate(prevProps) {
    if (!equalByKeys(this.props, prevProps, 'id', 'range')) {
      this.fetch()
    }
  }

  fetch = async () => {
    this.setState({ loading: true })
    try {
      const params = {
        spreadsheetId: this.props.id,
        range: this.props.range
      }
      const response = await this.props.api.client.sheets.spreadsheets.values.get(params)
      // Unable to cancel requests, so we wait until it's done and check it's still the desired one
      if (this.props.id == params.spreadsheetId && this.props.range == params.range) {
        this.setState({ loading: false, error: null, data: response.result.values })
      }
    } catch (response) {
      this.setState({ loading: false, error: response.result.error })
    }
  }

  render() {
    return this.props.children({
      error: this.state.error,
      data: this.state.data,
      loading: this.state.loading,
      refetch: this.fetch
    })
  }
}

const GSheet = props => (
  <GoogleApiConsumer>
    {api => <GSheetData api={api} {...props} />}
  </GoogleApiConsumer>
)

const Blob = ({ data }) =>
  <pre>
    {JSON.stringify(data, null, 2)}
  </pre>

const Table = ({ data }) =>
  <table>
    <thead>
      <tr>
        {data[0].map((label, i) => <th key={i}>{label}</th>)}
      </tr>
    </thead>
    <tbody>
      {data.slice(1).map((row, i) =>
        <tr key={i}>
          {row.map((cell, j) => <td key={j}>{cell}</td>)}
        </tr>
      )}
    </tbody>
  </table>

const RenderChoices = {
  table: Table,
  blob: Blob,
}

const MyData = ({ data, render }) => {
  const Comp = RenderChoices[render]
  return <Comp data={data} />
}

// Wraps the GSheet component to provide some basic components
// for display loading & error states
const SimpleGSheet = (props) => (
  <GSheet id={props.id} range={props.range}>
    {({ error, data, loading }) => (
      loading
        ? "Getting data..."
        : error
          ? JSON.stringify(error, null, 2)
          : data
            ? <MyData data={data} render={props.render} />
            : null
    )}
  </GSheet>
)

class Field extends React.Component {
  static propTypes = {
    name: PropTypes.string.isRequired,
    onChange: PropTypes.func.isRequired,
    value: PropTypes.any,
    label: PropTypes.string,
  }

  handleChange = event => {
    this.props.onChange(this.props.name, event.target.value)
  }

  render() {
    const label = this.props.label || this.props.name
    return (
      <div>
        <label htmlFor={this.props.name}>{label}</label>
        <div>
          <input id={this.props.name} value={this.props.value} onChange={this.handleChange} />
        </div>
      </div>
    )
  }
}

class Select extends React.Component {
  static propTypes = {
    name: PropTypes.string.isRequired,
    onChange: PropTypes.func.isRequired,
    value: PropTypes.any,
    label: PropTypes.string,
  }

  handleChange = event => {
    this.props.onChange(this.props.name, event.target.value)
  }

  render() {
    const label = this.props.label || this.props.name
    return (
      <div>
        <label htmlFor={this.props.name}>{label}</label>
        <div>
          <select id={this.props.name} value={this.props.value} onChange={this.handleChange}>
            {this.props.options.map(str =>
              <option value={str} key={str}>{str}</option>
            )}
          </select>
        </div>
      </div>
    )
  }
}

class DynamicSpreadsheet extends React.Component {
  state = {
    id: '',
    range: '',
    render: 'table',
    submitted: null
  }

  handleSubmit = event => {
    event.preventDefault();
    this.setState({
      submitted: {
        id: this.state.id,
        range: this.state.range
      }
    })
  }

  handleChange = (key, value) => this.setState({ [key]: value })

  render() {
    return (
      <div>
        <form onSubmit={this.handleSubmit}>
          <Field label="Spreadsheet ID" name="id" onChange={this.handleChange} value={this.state.id} />
          <Field label="Range" name="range" onChange={this.handleChange} value={this.state.range} />
          <Select
            label="Display"
            name="render"
            onChange={this.handleChange}
            value={this.state.render}
            options={Object.keys(RenderChoices)}
          />
          <input type="submit" value="Submit" />
        </form>
        {this.state.submitted &&
          <SimpleGSheet
            id={this.state.submitted.id}
            range={this.state.submitted.range}
            render={this.state.render}
          />
        }
      </div>
    )
  }
}

const SheetsDemo = (props) => (
  <GoogleAPI
    clientId={props.clientId}
    apiKey={props.apiKey}
    scopes={["https://www.googleapis.com/auth/spreadsheets.readonly"]}
    discoveryDocs={["https://sheets.googleapis.com/$discovery/rest?version=v4"]}
  >
    {({ authorize, loading: apiLoading, signout, signedIn, error }) => (
      <div>
        {(apiLoading || error) && <button onClick={props.reset}>Reset developer credentials</button>}
        {apiLoading
          ? <div>Loading...</div>
          : error
            ? <Blob data={error} />
            : signedIn
              ? <button onClick={signout}>Sign Out</button>
              : <button onClick={authorize}>Authorize</button>
        }
        {signedIn && <DynamicSpreadsheet />}
      </div>
    )}
  </GoogleAPI>
)

SheetsDemo.propTypes = {
  clientId: PropTypes.string.isRequired,
  apiKey: PropTypes.string.isRequired,
  reset: PropTypes.func.isRequired
}

class ApiForm extends React.Component {
  static propTypes = {
    onSubmit: PropTypes.func.isRequired
  }

  state = {
    apiKey: '',
    clientId: ''
  }

  handleSubmit = event => {
    event.preventDefault()
    this.props.onSubmit(this.state)
  }

  handleChange = (key, value) => this.setState({ [key]: value })

  render() {
    return (
      <form onSubmit={this.handleSubmit}>
        <Field
          name="apiKey"
          label="Google Developer API Key"
          value={this.state.apiKey}
          onChange={this.handleChange}
        />
        <Field
          name="clientId"
          label="Application Client ID"
          value={this.state.clientId}
          onChange={this.handleChange}
        />
        <input type="submit" value="Submit" />
      </form>
    )
  }
}

class App extends React.Component {
  state = {
    apiKey: '',
    clientId: ''
  }

  handleSubmit = state => this.setState(state)

  reset = () => this.setState({ apiKey: '', clientId: '' })

  render() {
    return (
      <div>
        <h1>Google Sheets API React Component</h1>
        {this.state.apiKey
          ? <SheetsDemo
            apiKey={this.state.apiKey}
            clientId={this.state.clientId}
            reset={this.reset}
          />
          : <ApiForm onSubmit={this.handleSubmit} />
        }
      </div>
    )
  }
}


ReactDOM.render(
  <App />,
  document.getElementById('root')
);
