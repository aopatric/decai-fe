import { useAuth0 } from "@auth0/auth0-react";
import { LogoutOptions } from "@auth0/auth0-react";
import Button from "@mui/material/Button";
import LogoutIcon from "@mui/icons-material/Logout";

const LogoutButton = () => {
  const { logout } = useAuth0();

  return (
    <Button
      color="success"
      variant="outlined"
      startIcon={<LogoutIcon />}
      sx={{ height: "40px", marginLeft: "20px" }}
      onClick={() =>
        logout({ returnTo: window.location.origin } as LogoutOptions)
      }
    >
      Log Out
    </Button>
  );
};

export default LogoutButton;
