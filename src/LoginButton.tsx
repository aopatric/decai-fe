import { useAuth0 } from "@auth0/auth0-react";
import Button from "@mui/material/Button";
import LoginIcon from "@mui/icons-material/Login";

const LoginButton = () => {
  const { loginWithRedirect } = useAuth0();

  return (
    <Button
      color="success"
      variant="outlined"
      startIcon={<LoginIcon />}
      onClick={() => loginWithRedirect()}
    >
      Log In
    </Button>
  );
};

export default LoginButton;
