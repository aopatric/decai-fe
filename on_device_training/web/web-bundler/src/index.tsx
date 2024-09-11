import { ThemeProvider, createTheme } from '@mui/material/styles';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { CssBaseline } from '@mui/material';

// Use a try-catch block to catch any potential errors during module loading
try {
  // Import the main App component
  const App = require('./App').default;

  // Create a dark theme using MUI's theme creator
  const darkTheme = createTheme({
    palette: {
      mode: 'dark',
    },
  });

  // Select the root container from the HTML
  const container = document.getElementById('root');

  // Ensure the container exists before trying to create a React root
  if (!container) {
    throw new Error('Root container is not found. Ensure there is an element with id="root" in the HTML.');
  }

  // Create a React root
  const root = createRoot(container);

  // Render the App component within the ThemeProvider
  root.render(
    <React.StrictMode>
      <ThemeProvider theme={darkTheme}>
        <CssBaseline />
        <App />
      </ThemeProvider>
    </React.StrictMode>
  );
} catch (error) {
  // Log any errors encountered during the import or rendering process
  console.error('An error occurred while loading the App component:', error);
  // Display an error message to the user
  const errorContainer = document.createElement('div');
  errorContainer.innerHTML = `<div style="color: red; font-size: 18px;">An error occurred while loading the application. Please check the console for more details.</div>`;
  document.body.appendChild(errorContainer);
}
