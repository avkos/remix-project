import React, { useEffect, useRef, useState } from "react"
import Web3 from 'web3'

import {
  PluginClient,
} from "@remixproject/plugin"
import { CustomTooltip } from '@remix-ui/helper'
import { Formik, ErrorMessage, Field } from "formik"

import { SubmitButton } from "../components"
import { Receipt } from "../types"
import { verify } from "../utils/verify"
import { receiptGuidScript, verifyScript } from "../utils/scripts"

interface Props {
  client: PluginClient
  apiKey: string
  onVerifiedContract: (receipt: Receipt) => void
  contracts: string[]
}

interface FormValues {
  contractName: string
  contractAddress: string
}

export const VerifyView: React.FC<Props> = ({
  apiKey,
  client,
  contracts,
  onVerifiedContract,
}) => {
  const [results, setResults] = useState("")
  const [networkName, setNetworkName] = useState("Loading...")
  const [showConstructorArgs, setShowConstructorArgs] = useState(false)
  const [isProxyContract, setIsProxyContract] = useState(false)
  const [constructorInputs, setConstructorInputs] = useState([])
  const verificationResult = useRef({})

  useEffect(() => {
    if (client && client.on) {
      client.on("blockchain" as any, 'networkStatus', (result) => {
        setNetworkName(`${result.network.name} ${result.network.id !== '-' ? `(Chain id: ${result.network.id})` : ''}`)
      })
    }
    return () => {
      // To fix memory leak
      if (client && client.off) client.off("blockchain" as any, 'networkStatus')
    }
  }, [client])

  const onVerifyContract = async (values: FormValues) => {
    const compilationResult = (await client.call(
      "solidity",
      "getCompilationResult"
    )) as any

    if (!compilationResult) {
      throw new Error("no compilation result available")
    }

    const constructorValues = []
    for (const key in values) {
      if (key.startsWith('contractArgValue')) constructorValues.push(values[key])
    }
    const web3 = new Web3()
    const constructorTypes = constructorInputs.map(e => e.type)
    let contractArguments = web3.eth.abi.encodeParameters(constructorTypes, constructorValues)   
    contractArguments = contractArguments.replace("0x", "")    

    verificationResult.current = await verify(
      apiKey,
      values.contractAddress,
      contractArguments,
      values.contractName,
      compilationResult,
      null,
      client,
      onVerifiedContract,
      setResults,
    )
    setResults(verificationResult.current['message'])
  }

  return (
    <div>
      <Formik
        initialValues={{
          contractName: "",
          contractAddress: "",
        }}
        validate={(values) => {
          const errors = {} as any
          if (!values.contractName) {
            errors.contractName = "Required"
          }
          if (!values.contractAddress) {
            errors.contractAddress = "Required"
          }
          if (values.contractAddress.trim() === "" || !values.contractAddress.startsWith('0x') 
              || values.contractAddress.length !== 42) {
            errors.contractAddress = "Please enter a valid contract address"
          }
          return errors
        }}
        onSubmit={(values) => onVerifyContract(values)}
      >
        {({ errors, touched, handleSubmit, handleChange, isSubmitting }) => {
          return (<form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="network">Selected Network</label> 
              <Field
                className="form-control"
                type="text"
                name="network"
                value={networkName}
                disabled={true}
              /> 
            </div>

            <div className="form-group">
              <label htmlFor="contractName">Contract Name</label>              
              <Field
                as="select"
                className={
                  errors.contractName && touched.contractName && contracts.length
                    ? "form-control is-invalid"
                    : "form-control"
                }
                name="contractName"
                onChange={async (e) => {
                    handleChange(e)
                    const {artefact} = await client.call("compilerArtefacts" as any, "getArtefactsByContractName", e.target.value)
                    if (artefact && artefact.abi && artefact.abi[0] && artefact.abi[0].type && artefact.abi[0].type === 'constructor' && artefact.abi[0].inputs.length > 0) {
                      setConstructorInputs(artefact.abi[0].inputs)
                      setShowConstructorArgs(true)
                    } else {
                      setConstructorInputs([])
                      setShowConstructorArgs(false)
                    }
                }}
              >
                <option disabled={true} value="">
                  { contracts.length ? 'Select a contract' : `--- No compiled contracts ---` }
                </option>
                {contracts.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </Field>
              <ErrorMessage
                className="invalid-feedback"
                name="contractName"
                component="div"
              />
            </div>

            <div className={ showConstructorArgs ? 'form-group d-block': 'form-group d-none' } >
              <label>Constructor Arguments</label>
                {constructorInputs.map((item, index) => {
                  return (
                    <div className="d-flex">
                      <Field
                        className="form-control m-1"
                        type="text"
                        key={`contractArgName${index}`}
                        name={`contractArgName${index}`}
                        value={item.name}
                        disabled={true}
                      />
                      <CustomTooltip
                        tooltipText={`value of ${item.name}`}
                        tooltipId={`etherscan-constructor-value${index}`}
                        placement='top'
                      >
                        <Field
                          className="form-control m-1"
                          type="text"
                          key={`contractArgValue${index}`}
                          name={`contractArgValue${index}`}
                          placeholder={item.type}
                        />
                      </CustomTooltip>
                    </div>
                  )}
                )}
              
            </div>

            <div className="form-group">
              <label htmlFor="contractAddress">Contract Address</label>
              <Field
                className={
                  errors.contractAddress && touched.contractAddress
                    ? "form-control is-invalid"
                    : "form-control"
                }
                type="text"
                name="contractAddress"
                placeholder="e.g. 0x11b79afc03baf25c631dd70169bb6a3160b2706e"
              />
              <ErrorMessage
                className="invalid-feedback"
                name="contractAddress"
                component="div"
              />
            </div>

            <div className="d-flex mb-2 custom-control custom-checkbox">
              <Field
                className="custom-control-input"
                type="checkbox"
                name="isProxy"
                id="isProxy"
                onChange={async (e) => {
                  handleChange(e)
                  if (e.target.checked) setIsProxyContract(true)
                  else setIsProxyContract(false)
              }}
              />
              <label className="form-check-label custom-control-label" htmlFor="isProxy">It's a proxy contract</label>
            </div>

            <div className={ isProxyContract ? 'form-group d-block': 'form-group d-none' }>
              <label htmlFor="expectedImplAddress">Expected Implementation Address (Optional)</label>
              <Field
                className="form-control"
                type="text"
                name="expectedImplAddress"
                placeholder="e.g. 0x11b79afc03baf25c631dd70169bb6a3160b2706e"
              />
            </div>

            <SubmitButton dataId="verify-contract" text="Verify" 
              isSubmitting={isSubmitting} 
              disable={ !contracts.length || 
                !touched.contractName ||
                !touched.contractAddress ||
                (touched.contractName && errors.contractName) ||
                (touched.contractAddress && errors.contractAddress) 
              ? true 
              : false}
            />
            <br/>
            <CustomTooltip
              tooltipText='Generate the required TS scripts to verify a contract on Etherscan'
              tooltipId='etherscan-generate-scripts'
              placement='bottom'
            >
              <button
                type="button"
                style={{ padding: "0.25rem 0.4rem", marginRight: "0.5em", marginBottom: "0.5em"}}
                className="btn btn-secondary btn-block"
                onClick={async () => {
                  if (!await client.call('fileManager', 'exists' as any, 'scripts/etherscan/receiptStatus.ts')) {
                    await client.call('fileManager', 'writeFile', 'scripts/etherscan/receiptStatus.ts', receiptGuidScript)
                    await client.call('fileManager', 'open', 'scripts/etherscan/receiptStatus.ts')
                  } else {
                    client.call('notification' as any, 'toast', 'File receiptStatus.ts already exists')
                  }
                  
                  if (!await client.call('fileManager', 'exists' as any, 'scripts/etherscan/verify.ts')) {
                    await client.call('fileManager', 'writeFile', 'scripts/etherscan/verify.ts', verifyScript)
                    await client.call('fileManager', 'open', 'scripts/etherscan/verify.ts')
                  } else {
                    client.call('notification' as any, 'toast', 'File verify.ts already exists')
                  }
                }}
                >
                  Generate Verification Scripts
                </button>
              </CustomTooltip>
          </form>
          )
        }
        }
      </Formik>

      <div data-id="verify-result"
        style={{ marginTop: "2em", fontSize: "0.8em", textAlign: "center", color: verificationResult.current['succeed'] ? "green" : "red" }}
        dangerouslySetInnerHTML={{ __html: results }}
      />

      {/* <div style={{ display: "block", textAlign: "center", marginTop: "1em" }}>
        <Link to="/receipts">View Receipts</Link>
      </div> */}
    </div>
  )
}
