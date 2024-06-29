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
`;

const Logo = styled.img`
  width: 100px;
  height: auto;
  margin-top: 100px;
`;

const ControlGroupContainer = styled.div`
  display: flex;
  flex-direction: column;
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

const MAX_NUM_OF_CLIENTS = 1; // FIXME: use 1 for now.
const RETRY_WAIT_TIME_MS = 4000;
const DOMAIN = process.env.REACT_APP_BACKEND_DOMAIN;

const App = () => {
  const [hastrainingStarted, setHasTrainingStarted] = useState(false);
  const [isTrainingCompleted, setIsTrainingCompleted] = useState(false);
  const [numOfClients, setNumOfClients] = useState(0);
  const [option, setOption] = useState("");
  const [clientId, setClientId] = useState();
  const [scalarData, setScalarData] = useState<ScalarData>({
    test_loss: [],
    test_acc: [],
    train_loss: [],
    train_acc: [],
  });
  const { user, isAuthenticated, isLoading } = useAuth0();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await axios.get(
          `${DOMAIN}/api/experiment-plots/?user=${clientId}`
        );

        const responseSclarLength = Object.keys(
          response?.data?.scalar_data
        ).length;
        const responseTestLossLength =
          response?.data?.scalar_data?.test_loss?.length;
        const currentTestLossLength = scalarData?.test_loss?.length;
        if (response.data && responseSclarLength !== 0) {
          // case 1: with data

          // case 1.1: data < 100
          // case 1.1.1: responseTestLossLength is the same as in the response, retry
          // case 1.1.2: responseTestLossLength is different, setScalarData, retry

          if (responseTestLossLength < 100) {
            if (responseTestLossLength !== currentTestLossLength) {
              setScalarData(response?.data?.scalar_data);
            }

            setTimeout(fetchData, RETRY_WAIT_TIME_MS);
          } else {
            setScalarData(response?.data?.scalar_data);
            setIsTrainingCompleted(true);
          }
        } else {
          // case: no data
          console.log("Data is empty, retrying...");
          setTimeout(fetchData, RETRY_WAIT_TIME_MS);
        }
      } catch (error) {
        // case: error
        console.error("Error fetching data:", error);
        setTimeout(fetchData, RETRY_WAIT_TIME_MS); // Retry after RETRY_WAIT_TIME_MS seconds in case of error
      }
    };

    if (clientId) {
      fetchData();
    }
  }, [clientId]);

  const handleChange = (event: SelectChangeEvent) => {
    setOption(event.target.value);
  };

  const startTrainingHandler = () => {
    if (numOfClients >= MAX_NUM_OF_CLIENTS) {
      return;
    }

    setNumOfClients(numOfClients + 1);
    setHasTrainingStarted(true);

    axios
      .get(`${DOMAIN}/api/spawn-client/`)
      .then((response) => {
        console.log("Training started:", response.data); // Log response data from the server
        setClientId(response.data.client_id);
      })
      .catch((error) => {
        console.error("Error starting training:", error);
      });
  };

  const renderResultChart = () => {
    const testLoss = splitStepAndValue(scalarData?.test_loss);
    const testAcc = splitStepAndValue(scalarData?.test_acc);
    const trainLoss = splitStepAndValue(scalarData?.train_loss);
    const trainAcc = splitStepAndValue(scalarData?.train_acc);
    return hastrainingStarted ? (
      <ChartsContainer>
        {isTrainingCompleted ? (
          <Box sx={{ width: "100%" }}>
            <b>
              <i>Client 1</i>
            </b>
            : Training complete
          </Box>
        ) : (
          <Box sx={{ width: "100%" }}>
            <b>
              <i>Client 1</i>
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

  const canPushSpawnButton = numOfClients < MAX_NUM_OF_CLIENTS;

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
          <h3>Remaining tokens: 100</h3>
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
            <SubTitle>
              <i>
                p.s. you can spawn up to {MAX_NUM_OF_CLIENTS}{" "}
                {MAX_NUM_OF_CLIENTS === 1 ? "client" : "clients"} for the demo.
              </i>
            </SubTitle>
          </ControlGroupContainer>
          <ResultChartContainer>{renderResultChart()}</ResultChartContainer>
        </>
      );
    }
  };

  return (
    <Container>
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
    </Container>
  );
};

export default App;
