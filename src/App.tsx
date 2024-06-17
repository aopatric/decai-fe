import Button from "@mui/material/Button";
import { useState } from "react";
import { LineChart } from "@mui/x-charts/LineChart";
import mitMediaLabLogo from "./assets/images/mit-media-lab-logo.png";
import InputLabel from "@mui/material/InputLabel";
import FormHelperText from "@mui/material/FormHelperText";
import FormControl from "@mui/material/FormControl";
import Select, { SelectChangeEvent } from "@mui/material/Select";
import styled from "styled-components";
import CircularProgress from "@mui/material/CircularProgress";

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
  flex-wrap: wrap;
  justify-content: center;
`;

const ResultChartContainer = styled.div`
  margin-top: 20px;
`;

const App = () => {
  const [hastrainingStarted, setHasTrainingStarted] = useState(false);
  const [hasPastTrainingResult, setHasPastTrainingResult] = useState(false);
  const [isResultReady, setIsResultReady] = useState(false);
  const [option, setOption] = useState("");

  const handleChange = (event: SelectChangeEvent) => {
    setOption(event.target.value);
  };

  const startTrainingHandler = () => {
    setHasTrainingStarted(true);

    setTimeout(() => {
      setIsResultReady(true);
    }, 2000);
  };

  const stopTrainingHandler = () => {
    setIsResultReady(false);
    setHasPastTrainingResult(true);
    setHasTrainingStarted(false);
  };

  const renderResultChart = () => {
    if (hastrainingStarted) {
      if (isResultReady) {
        return (
          <LineChart
            xAxis={[{ data: [1, 2, 3, 5, 8, 10] }]}
            series={[
              {
                data: [2, 5.5, 2, 8.5, 1.5, 5],
              },
            ]}
            width={500}
            height={300}
          />
        );
      } else {
        return <CircularProgress />;
      }
    }

    // check whether we have history data to show.
    if (hasPastTrainingResult) {
      return (
        <LineChart
          xAxis={[{ data: [1, 2, 3, 5, 8, 10] }]}
          series={[
            {
              data: [2, 5.5, 2, 8.5, 1.5, 5],
            },
          ]}
          width={500}
          height={300}
        />
      );
    }

    return null;
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

      <div>
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
      </div>

      {/* /////////////////////////////// */}
      <ControlGroupContainer>
        {hastrainingStarted ? (
          <Button
            variant="outlined"
            color="error"
            onClick={stopTrainingHandler}
          >
            Stop training
          </Button>
        ) : (
          <Button
            variant="contained"
            color="success"
            onClick={startTrainingHandler}
          >
            Start training
          </Button>
        )}
      </ControlGroupContainer>

      <ResultChartContainer>{renderResultChart()}</ResultChartContainer>
    </Container>
  );
};

export default App;
