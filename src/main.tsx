import '@fontsource/lilita-one/400.css';
import '@fontsource/nunito/800.css';
import '@fontsource/nunito/900.css';
import './ui/style/global.css';
import { render } from 'preact';
import { applyCssTokens } from './ui/style/tokens';
import { Title } from './ui/screens/Title';

applyCssTokens(document.documentElement);

function App() {
  return <Title onStart={() => console.info('start')} />;
}

render(<App />, document.getElementById('app')!);
