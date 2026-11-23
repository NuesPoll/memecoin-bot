import { Component, ReactNode } from 'react';
import { Alert, AlertIcon, Button, VStack } from '@chakra-ui/react';
export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <VStack><Alert status="error"><AlertIcon />This section could not be displayed.</Alert><Button onClick={() => this.setState({ failed: false })}>Try again</Button></VStack> : this.props.children;
  }
}
