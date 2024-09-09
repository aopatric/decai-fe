import Button from "@mui/material/Button";
import { useState, useEffect } from "react";
import { LineChart } from "@mui/x-charts/LineChart";
import mitMediaLabLogo from "./assets/images/mit-media-lab-logo.png";
import InputLabel from "@mui/material/InputLabel";
import FormHelperText from "@mui/material/FormHelperText";
import FormControl from "@mui/material/FormControl";
import Select, { SelectChangeEvent } from "@mui/material/Select";
import styled from "styled-components";
import axios from "axios";
import LinearProgress from "@mui/material/LinearProgress";
import Box from "@mui/material/Box";
import LoginButton from "./LoginButton";
import LogoutButton from "./LogoutButton";
import { useAuth0 } from "@auth0/auth0-react";
import Alert from "@mui/material/Alert";
import CustomNodes from "./CustomNodes";

// Define the type for the input data
interface DataPoint {
  step: number;
  value: number;
}

// Define the type for the output data
interface SplitResult {
  steps: number[];
  values: number[];
}

interface ScalarData {
  test_loss: DataPoint[];
  test_acc: DataPoint[];
  train_loss: DataPoint[];
  train_acc: DataPoint[];
}

function splitStepAndValue(data: DataPoint[] | undefined): SplitResult {
  if (!data) {
    return { steps: [], values: [] };
  }

  const steps = data.map((item) => item.step);
  const values = data.map((item) => item.value);
  return { steps, values };
}

const Title = styled.h1``;
const SubTitle = styled.p`
  margin: 20px 60px;
`;

const Container = styled.div`
  align-items: center;
  display: flex;
  flex-direction: column;
  margin: 0 auto;
  max-width: 960px;
  height: 100vh;
  margin-bottom: 100px;
`;

const Logo = styled.img`
  width: 100px;
  height: auto;
  margin-top: 100px;
`;

const ControlGroupContainer = styled.div`
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: center;
`;

const ResultChartContainer = styled.div`
  width: 100%;
  margin-top: 20px;
`;

const FormControlContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
`;

const ChartsContainer = styled.div`
  margin: 0 20px;
`;
const ChartsSecondaryContainer = styled.div`
  display: flex;
  flex-directio: row;
`;

const UserProfileContainer = styled.div`
  display: flex;
  align-items: center;
`;

const TOKEN_COST_PER_CLIENT = 20;
const RETRY_WAIT_TIME_MS = 10000; // 10s
const DOMAIN = process.env.REACT_APP_BACKEND_DOMAIN;

const App = () => {
  const [hasTrainingStarted, setHasTrainingStarted] = useState(false);
  const [isTrainingCompleted, setIsTrainingCompleted] = useState(false);
  const [showTokenAlert, setShowTokenAlert] = useState<boolean>(false);
  const [numOfClients, setNumOfClients] = useState(0);
  const [option, setOption] = useState("");
  const [currentClientIndex, setCurrentClientIndex] = useState<number>(0);
  const [clientIds, setClientIds] = useState<string[]>([]);
  const [scalarData, setScalarData] = useState<ScalarData[]>([
    {
      test_loss: [],
      test_acc: [],
      train_loss: [],
      train_acc: [],
    },
  ]);
  const { user, isAuthenticated, isLoading } = useAuth0();
  const [token, setToken] = useState<number>(0);
  const [remainingNumOfClients, setRemainingNumOfClients] = useState<number>(
    token / TOKEN_COST_PER_CLIENT
  );
  const [isLoadingToken, setIsLoadingToken] = useState<boolean>(false);

  useEffect(() => {
    setRemainingNumOfClients(Math.floor(token / TOKEN_COST_PER_CLIENT));
  }, [token]);

  // fetch the remaining tokens on the first page load
  const fetchToken = async () => {
    try {
      setIsLoadingToken(true);
      const response = await axios
        .get(`${DOMAIN}/api/get_or_init_tokens?email=${user?.email}`)
        .finally(() => {
          setIsLoadingToken(false);
        });
      const tokens = response?.data?.tokens;
      if (typeof tokens === "number") {
        setToken(tokens);
      } else {
        setShowTokenAlert(true);
      }
    } catch {
      setShowTokenAlert(true);
    }
  };

  useEffect(() => {
    if (user?.email) {
      fetchToken();
    }
  }, [user?.email]);

  useEffect(() => {
    const intervalIds: NodeJS.Timeout[] = [];

    const fetchDataForClient = async (clientId: string, idx: number) => {
      try {
        const response = await axios.get(
          `${DOMAIN}/api/experiment_plots/?user=${clientId}`
        );

        const responseScalarData = response.data?.scalar_data;
        if (
          responseScalarData &&
          Object.keys(responseScalarData).length !== 0
        ) {
          const responseTestLossLength = responseScalarData.test_loss?.length;
          const currentTestLossLength = scalarData[idx]?.test_loss?.length;

          if (responseTestLossLength < 100) {
            if (responseTestLossLength !== currentTestLossLength) {
              setScalarData((prevData) => {
                const newData = [...prevData];
                newData[idx] = responseScalarData;
                return newData;
              });
            }
          } else {
            setIsTrainingCompleted(true);
            clearInterval(intervalIds[idx]);
          }
        } else {
          console.log("Data is empty, retrying...");
        }
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    };

    clientIds.forEach((clientId, idx) => {
      if (!intervalIds[idx]) {
        intervalIds[idx] = setInterval(() => {
          fetchDataForClient(clientId, idx);
        }, RETRY_WAIT_TIME_MS);
      }
    });

    return () => {
      intervalIds.forEach(clearInterval);
    };
  }, [clientIds]);

  const handleChange = (event: SelectChangeEvent) => {
    setOption(event.target.value);
  };

  const startTrainingHandler = () => {
    if (remainingNumOfClients <= 0) {
      return;
    }

    setNumOfClients(numOfClients + 1);
    setHasTrainingStarted(true);

    axios
      .post(`${DOMAIN}/api/spawn_client/`)
      .then((response) => {
        setClientIds([...clientIds, response.data.client_id]);

        setCurrentClientIndex(currentClientIndex + 1);

        // if no error, we deduct tokens
        axios
          .post(`${DOMAIN}/api/consume_tokens`, {
            consumed_amt: TOKEN_COST_PER_CLIENT,
            email: user?.email,
          })
          .then(async () => {
            await fetchToken();
          });
      })
      .catch((error) => {
        console.error("Error starting training:", error);
      });
  };

  const earnTokens = () => {
    // if no error, we deduct tokens
    axios
      .post(`${DOMAIN}/api/reload_tokens`, {
        reload_amt: TOKEN_COST_PER_CLIENT,
        email: user?.email,
      })
      .then(async () => {
        await fetchToken();
      })
      .catch((error) => {
        console.error("Error starting training:", error);
      });
  };

  const renderResultChart = (idx: number) => {
    const testLoss = splitStepAndValue(scalarData[idx]?.test_loss);
    const testAcc = splitStepAndValue(scalarData[idx]?.test_acc);
    const trainLoss = splitStepAndValue(scalarData[idx]?.train_loss);
    const trainAcc = splitStepAndValue(scalarData[idx]?.train_acc);
    return hasTrainingStarted ? (
      <ChartsContainer>
        {isTrainingCompleted ? (
          <Box sx={{ width: "100%" }}>
            <b>
              <i>Client {idx}</i>
            </b>
            : Training complete
          </Box>
        ) : (
          <Box sx={{ width: "100%" }}>
            <b>
              <i>Client {idx + 1}</i>
            </b>
            : Training in progress...Please be patient while we fetch the plot
            data
            <LinearProgress />
          </Box>
        )}

        <ChartsSecondaryContainer>
          <LineChart
            xAxis={[{ data: testLoss?.steps }]}
            series={[
              {
                data: testLoss?.values,
                label: "Test Loss",
              },
            ]}
            width={500}
            height={300}
            grid={{ vertical: true, horizontal: true }}
          />
          <LineChart
            xAxis={[{ data: testAcc?.steps }]}
            series={[
              {
                data: testAcc?.values,
                label: "Test Accuracy",
              },
            ]}
            width={500}
            height={300}
            grid={{ vertical: true, horizontal: true }}
          />
        </ChartsSecondaryContainer>
        <ChartsSecondaryContainer>
          <LineChart
            xAxis={[{ data: trainLoss?.steps }]}
            series={[
              {
                data: trainLoss?.values,
                label: "Training Loss",
              },
            ]}
            width={500}
            height={300}
            grid={{ vertical: true, horizontal: true }}
          />
          <LineChart
            xAxis={[{ data: trainAcc?.steps }]}
            series={[
              {
                data: trainAcc?.values,
                label: "Training Accuracy",
              },
            ]}
            width={500}
            height={300}
            grid={{ vertical: true, horizontal: true }}
          />
        </ChartsSecondaryContainer>
      </ChartsContainer>
    ) : null;
  };

  const canPushSpawnButton = remainingNumOfClients > 0;

  const renderControlAndResult = () => {
    if (isLoading) {
      return <div>Loading ...</div>;
    }

    if (!isAuthenticated) {
      return <LoginButton />;
    } else {
      return (
        <>
          <UserProfileContainer>
            {user && <h2>Welcome, {user?.name}!</h2>}
            <LogoutButton />
          </UserProfileContainer>
          <SubTitle>
            <b>Remaining tokens:</b> {isLoadingToken ? "loading..." : token}
            <br />
            <b>Cost to spawn up a new client:</b> {TOKEN_COST_PER_CLIENT}
            <br />
            <i>
              i.e. you remaining tokens can still spawn up to{" "}
              {remainingNumOfClients} clients.
            </i>
          </SubTitle>
          <FormControlContainer>
            <FormControl sx={{ m: 1, minWidth: 220 }} disabled>
              <InputLabel id="demo-simple-select-disabled-label">
                num_clients
              </InputLabel>
              <Select
                labelId="demo-simple-select-disabled-label"
                id="demo-simple-select-disabled"
                value={option}
                label="Option"
                onChange={handleChange}
              ></Select>
              <FormHelperText>default: 10</FormHelperText>
            </FormControl>

            <FormControl sx={{ m: 1, minWidth: 220 }} disabled>
              <InputLabel id="demo-simple-select-disabled-label">
                exp_type
              </InputLabel>
              <Select
                labelId="demo-simple-select-disabled-label"
                id="demo-simple-select-disabled"
                value={option}
                label="Option"
                onChange={handleChange}
              ></Select>
              <FormHelperText>default: IID</FormHelperText>
            </FormControl>

            <FormControl sx={{ m: 1, minWidth: 220 }} disabled>
              <InputLabel id="demo-simple-select-disabled-label">
                algorithm
              </InputLabel>
              <Select
                labelId="demo-simple-select-disabled-label"
                id="demo-simple-select-disabled"
                value={option}
                label="Option"
                onChange={handleChange}
              ></Select>
              <FormHelperText>default: DARE</FormHelperText>
            </FormControl>
          </FormControlContainer>
          <ControlGroupContainer>
            <Button
              variant="contained"
              color="success"
              disabled={!canPushSpawnButton}
              onClick={startTrainingHandler}
            >
              {canPushSpawnButton
                ? "Spawn a new client"
                : "you've reached the limit"}
            </Button>
            <Button
              variant="contained"
              color="error"
              onClick={earnTokens}
              style={{ marginLeft: "10px" }}
            >
              Earn tokens
            </Button>
          </ControlGroupContainer>
          {clientIds.map((_, idx) => (
            <ResultChartContainer>
              {renderResultChart(idx)}
            </ResultChartContainer>
          ))}
        </>
      );
    }
  };

  return (
    <Container>
      {showTokenAlert && (
        <Alert
          severity="warning"
          onClose={() => {
            setShowTokenAlert(false);
          }}
        >
          Something went wrong with token fetching. Please try again later.
        </Alert>
      )}
      <Logo src={mitMediaLabLogo} alt="MIT Media Lab Logo" />
      <Title>Decentralized AI Demo</Title>
      <SubTitle>
        <i>
          Collaborative learning by sharing distilled images, a library for the
          Co-Dream paper that proposes a novel way to perform learning in a
          collaborative, distributed way via gradient descent in the data space.
        </i>
      </SubTitle>
      {renderControlAndResult()}

      <h2>WIP: Visualization with Dummy Data</h2>
      <CustomNodes />
    </Container>
  );
};

export default App;
