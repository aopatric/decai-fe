import { useAuth0 } from "@auth0/auth0-react";
import { LogoutOptions } from "@auth0/auth0-react";
import Button from "@mui/material/Button";
import LogoutIcon from "@mui/icons-material/Logout";

const LogoutButton = () => {
  const { logout } = useAuth0();
  const returnToUrl = process.env.REACT_APP_AUTH0_LOGOUT_REDIRECT_URI;

  // Additional debug statement
  if (!returnToUrl) {
    console.error(
      "REACT_APP_AUTH0_LOGOUT_REDIRECT_URI is not defined in the environment variables."
    );
  }

  return (
    <Button
      color="success"
      variant="outlined"
      startIcon={<LogoutIcon />}
      sx={{ height: "40px", marginLeft: "20px" }}
      onClick={() => logout({ returnTo: returnToUrl } as LogoutOptions)}
    >
      Log Out
    </Button>
  );
};

export default LogoutButton;
